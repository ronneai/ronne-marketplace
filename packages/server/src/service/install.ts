// `rmk-server service install` and `uninstall` (feature 083), the same on every system: a backend
// (systemd, launchd; WinSW in 086) does what differs.
import { basename } from "node:path";
import type { InstallOptions } from "./args.js";
import { nativeCaddyfile } from "./caddyfile.js";
import type { ServiceLayout } from "./layout.js";
import { type ServiceDefinition, type ServicePlan, servicePlan, upstreamFor } from "./model.js";
import { settingValue, updateSettings } from "./settings.js";
import type { System } from "./system.js";

export type Backend = {
  /** Why services can't be installed on this machine, when they can't. */
  unavailable: () => string | undefined;
  render: (definition: ServiceDefinition) => string;
  isActive: (definition: ServiceDefinition) => boolean;
  /** Creates the account (and its group) when it's missing; true when it did. */
  ensureAccount: (user: string, group: string, home: string) => boolean;
  removeAccount: (user: string, group: string) => void;
  /** Whether `user` can run the program (so a program in someone's home folder is caught). */
  canRun: (user: string, program: string, args: string[]) => boolean;
  chown: (path: string, user: string, group: string) => void;
  /** Gives `group` these files and folders, readable by it; owners and other modes stay. */
  shareWithGroup: (paths: string[], group: string) => void;
  /** After folders are made: SELinux labels, where there are any. */
  labelFolders: (paths: string[]) => void;
  /** Loads the definition written at `path`, enables it at boot and (re)starts it. */
  activate: (definition: ServiceDefinition, path: string) => string | undefined;
  /** Stops it, disables it and removes its definition. */
  deactivate: (definition: ServiceDefinition, path: string) => void;
  /** The last lines of its log, for a failed start. */
  recentLogs: (definition: ServiceDefinition) => string;
  /** How to read the log. */
  logsHint: (definition: ServiceDefinition) => string;
  /** How to install Caddy on this system. */
  caddyHint: () => string;
  /** Which program holds a port, when the system can tell. */
  portHolder: (port: number) => string | undefined;
};

/** What install records in the settings folder, for status, a later install and uninstall. */
export type ServiceState = {
  version: string;
  node: string;
  entry: string;
  port: number;
  host: string;
  domain?: string;
  tls?: string;
  email?: string;
  user: string;
  /** Accounts install created, which uninstall removes. */
  createdAccounts: string[];
};

export type InstallContext = {
  layout: ServiceLayout;
  node: string;
  entry: string;
  version: string;
};

export const STATE_FILE = "service.json";
/** Caddy 2.7 brought trusted_proxies_strict and {client_ip}, which the Caddyfile uses. */
export const MIN_CADDY = [2, 7] as const;
const HEALTH_WAIT_MS = 90_000;

export const statePath = (layout: ServiceLayout): string => `${layout.settingsDir}/${STATE_FILE}`;

export const readState = (sys: System, layout: ServiceLayout): ServiceState | undefined => {
  const text = sys.readFile(statePath(layout));
  if (!text) return undefined;
  try {
    return JSON.parse(text) as ServiceState;
  } catch {
    return undefined;
  }
};

/** npx and pnpm dlx run from a cache that can be cleaned, so a service can't point there. */
export const fromTemporaryCache = (entry: string): boolean => /\/(_npx|dlx)\//.test(entry);

export const caddyVersion = (output: string): [number, number] | undefined => {
  const match = /v(\d+)\.(\d+)\./.exec(output);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
};

const tooOld = ([major, minor]: [number, number]): boolean =>
  major < MIN_CADDY[0] || (major === MIN_CADDY[0] && minor < MIN_CADDY[1]);

/** The address people open. */
export const publicAddress = (plan: ServicePlan, port: number): string =>
  plan.settings.PUBLIC_URL ?? `http://localhost:${port}`;

const fail = (sys: System, message: string): number => {
  sys.err(`rmk-server: ${message}\n`);
  return 1;
};

export const needsRoot = (sys: System, action: string): number | undefined =>
  sys.isRoot()
    ? undefined
    : fail(
        sys,
        `service ${action} changes system services, so it needs root. Run: sudo rmk-server service ${action}`,
      );

const isWildcard = (host: string): boolean => host === "0.0.0.0" || host === "::";

export const installService = async (
  sys: System,
  backend: Backend,
  context: InstallContext,
  options: InstallOptions,
): Promise<number> => {
  const { layout } = context;
  const notRoot = needsRoot(sys, "install");
  if (notRoot !== undefined) return notRoot;
  if (fromTemporaryCache(context.entry))
    return fail(
      sys,
      "this rmk-server runs from npx's cache, which can be cleaned at any time, so a service can't point to it. Install it first: npm install --global @ronneai/marketplace, then: sudo rmk-server service install",
    );
  const unavailable = backend.unavailable();
  if (unavailable) return fail(sys, unavailable);

  // Checks first: nothing is written until they pass.
  const previous = readState(sys, layout);
  let caddy: string | undefined;
  if (options.domain) {
    caddy = sys.which("caddy");
    if (!caddy)
      return fail(sys, `--domain needs Caddy, which isn't on PATH. ${backend.caddyHint()}`);
    const version = caddyVersion(sys.run(caddy, ["version"]).stdout);
    if (!version || tooOld(version))
      return fail(
        sys,
        `--domain needs Caddy ${MIN_CADDY.join(".")} or later; ${caddy} is ${version ? version.join(".") : "a version it didn't say"}. ${backend.caddyHint()}`,
      );
    if (options.tls === "files")
      for (const file of ["cert.pem", "key.pem"])
        if (!sys.exists(`${layout.certsDir}/${file}`))
          return fail(
            sys,
            `--tls files reads ${layout.certsDir}/cert.pem (the full chain) and key.pem, and ${file} isn't there. Put both there first; install lets the proxy read them.`,
          );
    // Install changes these files' group, which through a link would change a key other services
    // share (certbot's, ssl-cert's). So they must be the proxy's own copies.
    if (options.tls === "files")
      for (const file of [
        layout.certsDir,
        `${layout.certsDir}/cert.pem`,
        `${layout.certsDir}/key.pem`,
      ])
        if (sys.isLink(file))
          return fail(
            sys,
            `${file} is a link (symbolic, or a hard link to another file). Install lets the proxy's group read these files, which through a link would change a file other services may share. Copy them there instead (sudo cp -L), and copy them again when the certificate is renewed (with certbot, a --deploy-hook that copies them and runs sudo rmk-server service restart).`,
          );
  }

  const plan = servicePlan({
    layout,
    node: context.node,
    entry: context.entry,
    port: options.port,
    host: options.host,
    ...(options.domain && caddy
      ? {
          proxy: {
            domain: options.domain,
            tls: options.tls,
            ...(options.email ? { email: options.email } : {}),
            caddy,
          },
        }
      : {}),
  });

  const ownPort =
    previous?.port === options.port && previous.host === options.host && backend.isActive(plan.app);
  if (!ownPort && !(await sys.portFree(options.port, options.host))) {
    const holder = backend.portHolder(options.port);
    return fail(
      sys,
      `port ${options.port} is in use on ${options.host}${holder ? ` by ${holder}` : ""}. Choose another with --port, for example --port ${options.port + 10}.`,
    );
  }
  if (plan.proxy && !backend.isActive(plan.proxy))
    for (const port of [80, 443])
      if (!(await sys.portFree(port, "0.0.0.0"))) {
        const holder = backend.portHolder(port);
        return fail(
          sys,
          `--domain serves HTTPS on ports 80 and 443, and port ${port} is in use${holder ? ` by ${holder}` : ""}. If it's a web server you run (a system Caddy, nginx, Apache), stop it, or keep it and point it at http://127.0.0.1:${options.port} instead of using --domain. A Caddy installed from a package starts its own service: sudo systemctl disable --now caddy.`,
        );
      }

  // The accounts, then checks that they can read what they run. A failed check removes the
  // accounts this run created, so nothing is left behind unrecorded.
  const created = new Set(previous?.createdAccounts ?? []);
  const createdNow: [string, string][] = [];
  if (layout.systemUser && backend.ensureAccount(layout.user, layout.group, layout.dataDir))
    createdNow.push([layout.user, layout.group]);
  if (plan.proxy && backend.ensureAccount(layout.proxyUser, layout.proxyGroup, layout.proxyDataDir))
    createdNow.push([layout.proxyUser, layout.proxyGroup]);
  const undo = (message: string): number => {
    for (const [user, group] of createdNow) backend.removeAccount(user, group);
    return fail(sys, message);
  };
  if (!backend.canRun(layout.user, context.node, [context.entry, "--version"]))
    return undo(
      `the ${layout.user} account can't run ${context.entry} with ${context.node}: a program in someone's home folder (nvm, a user prefix) isn't readable by other accounts. Install Node.js for the whole machine (your package manager or nodejs.org), then npm install --global @ronneai/marketplace with it, and run this again.`,
    );
  if (plan.proxy && options.tls === "files" && layout.proxyUser !== "root") {
    // The files are there for the proxy only: its group may read them (owner and other modes
    // stay), so a key kept at 600 works, and so does one from before an uninstall.
    const certs = [layout.certsDir, `${layout.certsDir}/cert.pem`, `${layout.certsDir}/key.pem`];
    backend.shareWithGroup(certs, layout.proxyGroup);
    for (const file of certs.slice(1))
      if (!backend.canRun(layout.proxyUser, "test", ["-r", file]))
        return undo(
          `the ${layout.proxyUser} account still can't read ${file} after install gave its group read access (an ACL, or a folder above it?). Check with: sudo -u ${layout.proxyUser} test -r ${file}`,
        );
  }
  for (const [user] of createdNow) created.add(user);

  // Folders and files. The settings folder is the server's: the setup writes the settings file
  // there (mode 600) through a temporary file and a rename.
  sys.mkdir(layout.dataDir, 0o750);
  sys.mkdir(layout.settingsDir, 0o755);
  const oldSettings = sys.readFile(layout.envFile) ?? "";
  // Without a domain now, drop what an earlier --domain install set.
  const remove =
    previous?.domain && !plan.proxy
      ? [
          "TRUST_PROXY",
          ...(settingValue(oldSettings, "PUBLIC_URL") === `https://${previous.domain}`
            ? ["PUBLIC_URL"]
            : []),
        ]
      : [];
  sys.writeFile(layout.envFile, updateSettings(oldSettings, plan.settings, remove), 0o600);
  backend.chown(layout.dataDir, layout.user, layout.group);
  backend.chown(layout.settingsDir, layout.user, layout.group);
  const folders = [layout.dataDir, layout.settingsDir];
  if (plan.proxy) {
    sys.mkdir(layout.proxyDataDir, 0o700);
    backend.chown(layout.proxyDataDir, layout.proxyUser, layout.proxyGroup);
    // root's, so the server's account can't change what the proxy runs. The certificates folder
    // is made once, for the proxy's group; files people put in it are left as they are.
    sys.mkdir(layout.proxySettingsDir, 0o755);
    if (!sys.exists(layout.certsDir)) {
      sys.mkdir(layout.certsDir, 0o750);
      backend.chown(layout.certsDir, "root", layout.proxyGroup);
    }
    sys.writeFile(
      layout.caddyfile,
      nativeCaddyfile({
        domain: plan.proxy.options.domain,
        tls: plan.proxy.options.tls,
        ...(plan.proxy.options.email ? { email: plan.proxy.options.email } : {}),
        certsDir: layout.certsDir,
        upstream: plan.proxy.upstream,
      }),
      0o644,
    );
    folders.push(layout.proxyDataDir, layout.proxySettingsDir);
  }
  backend.labelFolders(folders);
  const state: ServiceState = {
    version: context.version,
    node: context.node,
    entry: context.entry,
    port: options.port,
    host: options.host,
    ...(options.domain ? { domain: options.domain, tls: options.tls } : {}),
    ...(options.email ? { email: options.email } : {}),
    user: layout.user,
    createdAccounts: [...created],
  };
  sys.writeFile(statePath(layout), `${JSON.stringify(state, null, 2)}\n`, 0o644);

  // The services.
  sys.writeFile(layout.definition, backend.render(plan.app), 0o644);
  const appError = backend.activate(plan.app, layout.definition);
  if (appError) return fail(sys, appError);
  if (plan.proxy) {
    sys.writeFile(layout.proxyDefinition, backend.render(plan.proxy), 0o644);
    const proxyError = backend.activate(plan.proxy, layout.proxyDefinition);
    if (proxyError) return fail(sys, proxyError);
  } else if (sys.exists(layout.proxyDefinition)) {
    const old = servicePlan({
      layout,
      node: context.node,
      entry: context.entry,
      port: options.port,
      host: options.host,
      proxy: { domain: "localhost", tls: "auto", caddy: "caddy" },
    }).proxy as ServiceDefinition;
    backend.deactivate(old, layout.proxyDefinition);
    sys.remove(layout.caddyfile);
  }

  // Wait until it answers: 503 before the setup, 200 after.
  const healthUrl = `http://${upstreamFor(options.host, options.port)}/api/health`;
  let status: number | undefined;
  for (const start = Date.now(); Date.now() - start < HEALTH_WAIT_MS; await sys.sleep(1000)) {
    status = await sys.httpStatus(healthUrl);
    if (status === 200 || status === 503) break;
  }
  if (status !== 200 && status !== 503) {
    sys.err(backend.recentLogs(plan.app));
    return fail(
      sys,
      `the service started but didn't answer at ${healthUrl} within ${HEALTH_WAIT_MS / 1000} seconds. Its log is above; ${backend.logsHint(plan.app)} shows more.`,
    );
  }
  if (plan.proxy) {
    await sys.sleep(2000);
    if (!backend.isActive(plan.proxy)) {
      sys.err(backend.recentLogs(plan.proxy));
      return fail(sys, `the HTTPS proxy (${plan.proxy.name}) stopped. Its log is above.`);
    }
  }

  const address = publicAddress(plan, options.port);
  sys.out(
    [
      `Ronne is running as a service (${plan.app.name}), started at boot and restarted if it stops.`,
      `  Address:   ${address}`,
      ...(plan.proxy ? [`  Proxy:     ${plan.proxy.name}, Caddy on ports 80 and 443`] : []),
      `  Data:      ${layout.dataDir}`,
      `  Settings:  ${layout.envFile}`,
      `  Logs:      ${backend.logsHint(plan.app)}`,
      "",
      status === 503
        ? `Next: open ${address} and finish the setup.`
        : `It's set up: open ${address}.`,
      "",
    ].join("\n"),
  );
  if (isWildcard(options.host) && !plan.proxy)
    sys.err(
      `Warning: it listens on ${options.host}:${options.port} over plain HTTP, so anyone on the network can reach it and passwords cross it unencrypted. Put it behind HTTPS (--domain, or your own proxy) before using it beyond a network you trust.\n`,
    );
  return 0;
};

export const uninstallService = async (
  sys: System,
  backend: Backend,
  context: InstallContext,
  deleteData: boolean,
): Promise<number> => {
  const { layout } = context;
  const notRoot = needsRoot(sys, "uninstall");
  if (notRoot !== undefined) return notRoot;
  const state = readState(sys, layout);
  const installed = sys.exists(layout.definition) || state !== undefined;
  const folders = [
    layout.dataDir,
    layout.settingsDir,
    layout.proxyDataDir,
    layout.proxySettingsDir,
  ].filter((path) => sys.exists(path));
  if (!installed && !(deleteData && folders.length > 0)) {
    sys.out("The rmk-server service isn't installed here.\n");
    return 0;
  }
  if (deleteData && folders.length > 0) {
    const name = basename(layout.dataDir);
    sys.out(
      `This deletes, for good: ${folders.join(", ")}: the database, the stored items and the settings.\n`,
    );
    const answer = await sys.ask(`Type the data folder's name (${name}) to confirm: `);
    if (answer !== name) {
      sys.err("Not confirmed: nothing was changed.\n");
      return 1;
    }
  }

  const plan = servicePlan({
    layout,
    node: state?.node ?? context.node,
    entry: state?.entry ?? context.entry,
    port: state?.port ?? 7650,
    host: state?.host ?? "127.0.0.1",
    proxy: { domain: "localhost", tls: "auto", caddy: "caddy" },
  });
  if (sys.exists(layout.proxyDefinition) && plan.proxy)
    backend.deactivate(plan.proxy, layout.proxyDefinition);
  if (sys.exists(layout.definition)) backend.deactivate(plan.app, layout.definition);
  sys.remove(layout.caddyfile);
  sys.remove(statePath(layout));
  // Only the two accounts install makes: service.json sits in a folder the server's account can
  // write, so its list isn't trusted with anything else.
  const accounts: [string, string][] = [
    [layout.user, layout.group],
    [layout.proxyUser, layout.proxyGroup],
  ];
  for (const [user, group] of accounts)
    if (layout.systemUser || user !== layout.user)
      if (state?.createdAccounts?.includes(user)) {
        backend.removeAccount(user, group);
        // Kept certificates go back to root's group rather than a number nobody has.
        if (user === layout.proxyUser && !deleteData && sys.exists(layout.certsDir))
          backend.chown(layout.certsDir, "root", "root");
      }

  if (deleteData) {
    for (const path of folders) sys.remove(path);
    sys.out("Removed the rmk-server service and deleted its data and settings.\n");
  } else
    sys.out(
      `Removed the rmk-server service. The data stays in ${layout.dataDir} and the settings in ${layout.envFile}: sudo rmk-server service install uses them again.\n`,
    );
  return 0;
};
