// `rmk-server service status | start | stop | restart | logs` (feature 083), and the scripts
// (setup, migrate, reset-root-password) run for an installed service.
import { dirname, join } from "node:path";
import {
  asAdmin,
  type Backend,
  type InstallContext,
  needsRoot,
  readState,
  type ServiceState,
  statePath,
  unsafeFiles,
} from "./install.js";
import { type ServiceDefinition, servicePlan, upstreamFor } from "./model.js";
import type { System } from "./system.js";

/** Exit codes for status, as systemctl's: running, installed but stopped, not installed. */
export const STATUS_RUNNING = 0;
export const STATUS_STOPPED = 3;
export const STATUS_NOT_INSTALLED = 4;

const definitionsFor = (
  context: InstallContext,
  state: ServiceState,
): { app: ServiceDefinition; proxy?: ServiceDefinition } => {
  const plan = servicePlan({
    layout: context.layout,
    node: state.node,
    entry: state.entry,
    port: state.port,
    host: state.host,
    // Only the proxy's name, label and log file are used here.
    ...(state.domain ? { proxy: { domain: state.domain, tls: "auto", caddy: "caddy" } } : {}),
  });
  return { app: plan.app, ...(plan.proxy ? { proxy: plan.proxy } : {}) };
};

/** The version of the rmk-server package at `entry` (…/dist/bin.js), if it's still there. */
const versionAt = (sys: System, entry: string): string | undefined => {
  const text = sys.readFile(join(dirname(entry), "..", "package.json"));
  try {
    return text ? (JSON.parse(text) as { version?: string }).version : undefined;
  } catch {
    return undefined;
  }
};

const notInstalled = (sys: System): number => {
  sys.out(
    `The rmk-server service isn't installed here. Install it with: ${asAdmin(sys, "rmk-server service install")}\n`,
  );
  return STATUS_NOT_INSTALLED;
};

export const serviceStatus = async (
  sys: System,
  backend: Backend,
  context: InstallContext,
): Promise<number> => {
  const { layout } = context;
  const state = readState(sys, layout);
  // Windows: the record is the administrators' only, so a plain terminal sees the service but not it.
  if (!state && sys.platform === "win32" && !sys.isRoot() && sys.exists(layout.definition)) {
    // Only the name matters to isActive, and anyone may ask Windows about a service.
    const { app } = definitionsFor(context, {
      node: context.node,
      entry: context.entry,
      port: 7650,
      host: "127.0.0.1",
    } as ServiceState);
    const running = backend.isActive(app);
    sys.out(
      `rmk-server service: installed, ${running ? "running" : "stopped"}. Its details are for administrators: ${asAdmin(sys, "rmk-server service status")}\n`,
    );
    return running ? STATUS_RUNNING : STATUS_STOPPED;
  }
  if (!state || !sys.exists(layout.definition)) return notInstalled(sys);
  const { app, proxy } = definitionsFor(context, state);
  const running = backend.isActive(app);
  const filesVersion = versionAt(sys, state.entry);
  const health = running
    ? await sys.httpStatus(`http://${upstreamFor(state.host, state.port)}/api/health`)
    : undefined;
  const address = state.domain ? `https://${state.domain}` : `http://localhost:${state.port}`;
  const lines = [
    `rmk-server service: installed, ${running ? "running" : "stopped"}`,
    `  Version:   ${filesVersion ?? "unknown"}${
      filesVersion && filesVersion !== state.version
        ? ` (it was ${state.version} at the last install or restart: ${asAdmin(sys, "rmk-server service restart")} runs ${filesVersion})`
        : ""
    }`,
    `  Address:   ${address}${
      health === 503
        ? ` (not set up yet: open it, or run ${asAdmin(sys, "rmk-server setup")})`
        : health === 200
          ? ""
          : running
            ? " (not answering yet)"
            : ""
    }`,
    `  Listens:   ${state.host}:${state.port}`,
    `  Account:   ${state.user}`,
    `  Data:      ${layout.dataDir}`,
    `  Settings:  ${layout.envFile}`,
    `  Logs:      ${backend.logsHint(app)}`,
    `  Proxy:     ${
      proxy
        ? `${proxy.name}, ${backend.isActive(proxy) ? "running" : "stopped"} (Caddy, ${state.tls ?? "auto"} certificates)`
        : "none (no --domain)"
    }`,
  ];
  // A moved or removed install: the service points to files that aren't there any more.
  const missing = [state.node, state.entry].filter((path) => !sys.exists(path));
  if (missing.length > 0)
    lines.push(
      "",
      `It runs ${missing.join(" and ")}, which ${missing.length > 1 ? "aren't" : "isn't"} there any more (moved, or removed by npm). Run ${asAdmin(sys, "rmk-server service install")} again from the rmk-server you use now.`,
    );
  sys.out(`${lines.join("\n")}\n`);
  return running ? STATUS_RUNNING : STATUS_STOPPED;
};

type Control = "start" | "stop" | "restart";

export const controlService = async (
  sys: System,
  backend: Backend,
  context: InstallContext,
  action: Control,
): Promise<number> => {
  const notRoot = needsRoot(sys, action);
  if (notRoot !== undefined) return notRoot;
  const { layout } = context;
  const unsafe = unsafeFiles(sys, layout);
  if (unsafe) {
    sys.err(`rmk-server: ${unsafe}\n`);
    return 1;
  }
  const state = readState(sys, layout);
  if (!state || !sys.exists(layout.definition)) return notInstalled(sys);
  const { app, proxy } = definitionsFor(context, state);
  const services = [
    { definition: app, path: layout.definition },
    ...(proxy ? [{ definition: proxy, path: layout.proxyDefinition }] : []),
  ];

  if (action === "stop") {
    // The proxy first, so nothing is sent to a server that's going away.
    for (const { definition } of [...services].reverse()) backend.stop(definition);
    sys.out(
      `Stopped the rmk-server service. It starts again at the next boot, or with: ${asAdmin(sys, "rmk-server service start")}\n`,
    );
    return 0;
  }
  for (const { definition, path } of services) {
    const error =
      action === "start" ? backend.start(definition, path) : backend.restart(definition, path);
    if (error) {
      sys.err(`rmk-server: couldn't ${action} ${definition.name}: ${error}\n`);
      return 1;
    }
  }
  // A restart runs the files npm has now: record their version for status.
  const version = versionAt(sys, state.entry);
  if (action === "restart" && version && version !== state.version)
    sys.writeFile(statePath(layout), `${JSON.stringify({ ...state, version }, null, 2)}\n`, 0o644);
  const url = `http://${upstreamFor(state.host, state.port)}/api/health`;
  for (let tries = 0; tries < 90; tries++) {
    const status = await sys.httpStatus(url);
    if (status === 200 || status === 503) {
      sys.out(
        `${action === "start" ? "Started" : "Restarted"} the rmk-server service${version ? ` (${version})` : ""}.\n`,
      );
      return 0;
    }
    await sys.sleep(1000);
  }
  sys.err(backend.recentLogs(app));
  sys.err(`rmk-server: it didn't answer at ${url}. Its log is above.\n`);
  return 1;
};

export const serviceLogs = async (
  sys: System,
  backend: Backend,
  context: InstallContext,
): Promise<number> => {
  const state = readState(sys, context.layout);
  if (!state) return notInstalled(sys);
  const { app, proxy } = definitionsFor(context, state);
  return backend.followLogs(proxy ? [app, proxy] : [app]);
};

const SCRIPT_VERBS: Record<string, string> = {
  setup: "set it up",
  migrate: "migrate its database",
  "reset-root-password": "reset its root password",
};

/**
 * `setup`, `migrate` and `reset-root-password` on a machine with the service installed: run as its
 * account, on its data and settings, rather than on root's own folder. Undefined when they should
 * run as usual (no service, or RONNE_DATA_DIR or RONNE_ENV_FILE chosen).
 *
 * service.json sits in a folder the service's account can write, so nothing in it decides what
 * runs as root or as whom: the program is the one running now, and the account is the layout's
 * system account, or with --user the person who ran sudo, never root.
 */
export const scriptForService = async (
  sys: System,
  context: InstallContext,
  script: string,
  args: string[],
): Promise<number | undefined> => {
  if (sys.env.RONNE_DATA_DIR || sys.env.RONNE_ENV_FILE) return undefined;
  const { layout } = context;
  const state = readState(sys, layout);
  if (!state) return undefined;
  if (!sys.isRoot()) {
    sys.err(
      `rmk-server: the rmk-server service is installed here, with its data in ${layout.dataDir}. To ${SCRIPT_VERBS[script] ?? script}, run: ${asAdmin(sys, `rmk-server ${script}`)}\nFor a separate instance of your own, set RONNE_DATA_DIR first.\n`,
    );
    return 1;
  }
  const refusal = unsafeFiles(sys, layout);
  if (refusal) {
    sys.err(`rmk-server: ${refusal}\n`);
    return 1;
  }
  // Windows: a virtual account can't be started from a terminal, so the script runs as the
  // administrator running it; what it writes in the data folder inherits the folder's permissions,
  // the service's account's included.
  if (sys.platform === "win32") {
    // The service's account may write the data folder, and the script runs as an administrator:
    // a link it put there would take the administrator's writes elsewhere.
    const links = sys.findLinks(layout.dataDir);
    if (links.length > 0) {
      sys.err(
        `rmk-server: ${links.join(", ")} ${links.length > 1 ? "are links" : "is a link"} (a symbolic link, a junction, or a file with another hard link), which the data folder never holds. Look at ${links.length > 1 ? "them" : "it"} and remove ${links.length > 1 ? "them" : "it"} first.\n`,
      );
      return 1;
    }
    sys.out(`The rmk-server service's ${layout.dataDir}:\n`);
    return sys.runAttached(context.node, [context.entry, script, ...args], {
      cwd: layout.dataDir,
      env: {
        ...sys.env,
        RONNE_DATA_DIR: layout.dataDir,
        RONNE_ENV_FILE: layout.envFile,
        PORT: String(state.port),
        RONNE_SERVICE: "1",
        ...(state.domain ? { PUBLIC_URL: `https://${state.domain}` } : {}),
      },
    });
  }
  // The system account; on macOS also the person running sudo, for a --user install.
  const allowed = [
    layout.user,
    ...(sys.platform === "darwin" && sys.env.SUDO_USER ? [sys.env.SUDO_USER] : []),
  ].filter((name) => name !== "root");
  const account = allowed.includes(state.user) ? state.user : undefined;
  const ids = account ? ["-u", "-g"].map((flag) => sys.run("id", [flag, account])) : [];
  const [uid, gid] = ids.map((result) => Number(result.stdout.trim()));
  if (
    !account ||
    ids.some((result) => result.code !== 0 || !/^\d+$/.test(result.stdout.trim())) ||
    uid === 0
  ) {
    sys.err(
      `rmk-server: the service's account (${state.user}) isn't one it may use here${
        layout.systemUser ? "" : " (with --user, run sudo from that account)"
      }, or isn't there. Run ${asAdmin(sys, "rmk-server service install")} again.\n`,
    );
    return 1;
  }
  sys.out(`The rmk-server service's ${layout.dataDir}, as ${account}:\n`);
  // Started directly as the account (no sudo, which would drop the environment), so setup --yes
  // still gets DATABASE_URL and RONNE_ROOT_* without them showing in the process list.
  return sys.runAttached(context.node, [context.entry, script, ...args], {
    cwd: "/",
    uid: uid as number,
    gid: gid as number,
    env: {
      ...sys.env,
      HOME: layout.dataDir,
      RONNE_DATA_DIR: layout.dataDir,
      RONNE_ENV_FILE: layout.envFile,
      PORT: String(state.port),
      // The setup's last words: the service already runs it (apps/web/scripts/setup.ts).
      RONNE_SERVICE: "1",
      // The setup in a terminal takes the address from the environment: keep the domain's.
      ...(state.domain ? { PUBLIC_URL: `https://${state.domain}` } : {}),
    },
  });
};
