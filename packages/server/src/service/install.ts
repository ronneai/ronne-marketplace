// `rmk-server service install` and `uninstall` (feature 083), the same on every system: a backend
// (systemd, launchd; WinSW in 086) does what differs.
import { basename, dirname, posix, win32 } from "node:path";
import type { InstallOptions } from "./args.js";
import { nativeCaddyfile } from "./caddyfile.js";
import { PROXY_NAME, type ServiceLayout } from "./layout.js";
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
  /** Changes the owner of a path and, unless `recursive` is false, of everything in it. */
  chown: (path: string, user: string, group: string, recursive?: boolean) => void;
  /** Gives `group` these files and folders, readable by it; owners and other modes stay. */
  shareWithGroup: (paths: string[], group: string) => void;
  /**
   * Makes a folder (and its missing parents) with these permissions. Windows makes Ronne's with
   * their final permissions at once, and refuses one that's there but isn't the administrators'.
   */
  makeFolder: (path: string, mode: number) => void;
  /** After folders are made: SELinux labels, where there are any. */
  labelFolders: (paths: string[]) => void;
  /** Loads the definition written at `path`, enables it at boot and (re)starts it. */
  activate: (definition: ServiceDefinition, path: string) => string | undefined;
  /** Stops it, disables it and removes its definition. */
  deactivate: (definition: ServiceDefinition, path: string) => void;
  /** Starts it if it isn't running. */
  start: (definition: ServiceDefinition, path: string) => string | undefined;
  /** Stops it until the next start or boot. */
  stop: (definition: ServiceDefinition) => void;
  restart: (definition: ServiceDefinition, path: string) => string | undefined;
  /** Follows the logs of these services, attached to the terminal; returns the exit code. */
  followLogs: (definitions: ServiceDefinition[]) => Promise<number>;
  /** The last lines of its log, for a failed start. */
  recentLogs: (definition: ServiceDefinition) => string;
  /** How to read the log. */
  logsHint: (definition: ServiceDefinition) => string;
  /** How to install Caddy on this system. */
  caddyHint: () => string;
  /** Which program holds a port, when the system can tell. */
  portHolder: (port: number) => string | undefined;
  /**
   * Lets these ports in through the system's firewall, as one rule named after `name` (Windows):
   * on Private networks only, or on every network (`everywhere`, for a public HTTPS proxy).
   */
  allowInbound: (name: string, ports: number[], everywhere?: boolean) => void;
  /** Removes that rule, if there is one. */
  removeInbound: (name: string) => void;
  /** Why `user` can't run the program, and what to do (when canRun said it can't). */
  cantRunHint: (user: string, node: string, entry: string) => string;
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

/** A path in one of the layout's folders, with the system's own separator. */
export const inLayout = (layout: ServiceLayout, ...parts: string[]): string =>
  (layout.platform === "win32" ? win32 : posix).join(...parts);

export const statePath = (layout: ServiceLayout): string =>
  inLayout(layout, layout.settingsDir, STATE_FILE);

/** A command that needs root, or on Windows an administrator, as people should type it. */
export const asAdmin = (sys: System, command: string): string =>
  sys.platform === "win32"
    ? `${command} (in a terminal opened as administrator)`
    : `sudo ${command}`;

/**
 * The settings folder is the service account's, so root never reads or writes through a link it
 * may have put there (to /etc/shadow, say). Undefined when both files are plain, or missing.
 */
export const unsafeFiles = (sys: System, layout: ServiceLayout): string | undefined => {
  const links = [layout.envFile, statePath(layout)].filter((path) => sys.isLink(path));
  return links.length === 0
    ? undefined
    : `${links.join(" and ")} ${links.length > 1 ? "are links" : "is a link"}, which this folder's files never are; something changed ${links.length > 1 ? "them" : "it"}. Look at ${links.length > 1 ? "them" : "it"}, remove ${links.length > 1 ? "them" : "it"}, and run this again.`;
};

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
export const fromTemporaryCache = (entry: string): boolean => /[\\/](_npx|dlx)[\\/]/.test(entry);

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
        sys.platform === "win32"
          ? `service ${action} changes Windows services, so it needs an administrator. Open a terminal as administrator (right-click PowerShell or Terminal, Run as administrator) and run: rmk-server service ${action}`
          : `service ${action} changes system services, so it needs root. Run: sudo rmk-server service ${action}`,
      );

/** Linux and macOS: why an account can't run the program (cantRunHint). */
export const homeFolderHint = (user: string, node: string, entry: string): string =>
  `the ${user} account can't run ${entry} with ${node}: a program in someone's home folder (nvm, a user prefix) isn't readable by other accounts. Install Node.js for the whole machine (your package manager or nodejs.org), then npm install --global @ronneai/marketplace with it, and run this again.`;

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
      `this rmk-server runs from npx's cache, which can be cleaned at any time, so a service can't point to it. Install it first: npm install --global @ronneai/marketplace, then: ${asAdmin(sys, "rmk-server service install")}`,
    );
  const unavailable = backend.unavailable();
  if (unavailable) return fail(sys, unavailable);
  const unsafe = unsafeFiles(sys, layout);
  if (unsafe) return fail(sys, unsafe);

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
        if (!sys.exists(inLayout(layout, layout.certsDir, file)))
          return fail(
            sys,
            `--tls files reads ${inLayout(layout, layout.certsDir, "cert.pem")} (the full chain) and key.pem, and ${file} isn't there. Put both there first; install lets the proxy read them.`,
          );
    // Install changes these files' group, which through a link would change a key other services
    // share (certbot's, ssl-cert's). So they must be the proxy's own copies.
    if (options.tls === "files")
      for (const file of [
        layout.certsDir,
        inLayout(layout, layout.certsDir, "cert.pem"),
        inLayout(layout, layout.certsDir, "key.pem"),
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
  if (
    plan.proxy &&
    layout.proxyUser !== "root" &&
    backend.ensureAccount(layout.proxyUser, layout.proxyGroup, layout.proxyDataDir)
  )
    createdNow.push([layout.proxyUser, layout.proxyGroup]);
  const undo = (message: string): number => {
    for (const [user, group] of createdNow) backend.removeAccount(user, group);
    return fail(sys, message);
  };
  if (!backend.canRun(layout.user, context.node, [context.entry, "--version"]))
    return undo(backend.cantRunHint(layout.user, context.node, context.entry));
  // Windows: Caddy from winget for one person is in their profile, which the proxy can't read.
  if (
    plan.proxy &&
    caddy &&
    layout.platform === "win32" &&
    !backend.canRun(layout.proxyUser, caddy, ["version"])
  )
    return undo(
      `the proxy's account (${layout.proxyUser}) can't run ${caddy}: it's in a user's profile, which other accounts can't read. ${backend.caddyHint()}`,
    );
  if (plan.proxy && options.tls === "files" && layout.proxyUser !== "root") {
    // The files are there for the proxy only: its group may read them (owner and other modes
    // stay), so a key kept at 600 works, and so does one from before an uninstall.
    // Windows: the folder made and checked (Ronne's tree) before its files are shared.
    if (layout.platform === "win32") backend.makeFolder(layout.certsDir, 0o750);
    const certs = [
      layout.certsDir,
      inLayout(layout, layout.certsDir, "cert.pem"),
      inLayout(layout, layout.certsDir, "key.pem"),
    ];
    backend.shareWithGroup(certs, layout.proxyGroup);
    for (const file of certs.slice(1))
      if (!backend.canRun(layout.proxyUser, "test", ["-r", file]))
        return undo(
          `the ${layout.proxyUser} account still can't read ${file} after install gave its group read access (an ACL, or a folder above it?). Check with: sudo -u ${layout.proxyUser} test -r ${file}`,
        );
  }
  for (const [user] of createdNow) created.add(user);

  // Folders and files. The settings folder is root's and only the settings file in it the
  // server's (the setup rewrites it in place there). So the server's account can't swap a name
  // in it for a link between root's check and root's read, or plant files root would trust
  // (service.json). Taken back first, then checked again, before anything in it is read.
  backend.makeFolder(layout.dataDir, 0o750);
  backend.makeFolder(layout.settingsDir, 0o755);
  backend.chown(layout.settingsDir, "root", layout.rootGroup, false);
  const relinked = unsafeFiles(sys, layout);
  if (relinked) return fail(sys, relinked);
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
  backend.chown(layout.envFile, layout.user, layout.group, false);
  const folders = [layout.dataDir, layout.settingsDir];
  if (plan.proxy) {
    backend.makeFolder(layout.proxyDataDir, 0o700);
    backend.chown(layout.proxyDataDir, layout.proxyUser, layout.proxyGroup);
    // root's, so the server's account can't change what the proxy runs. The certificates folder
    // is made once, for the proxy's group; files people put in it are left as they are.
    backend.makeFolder(layout.proxySettingsDir, 0o755);
    if (!sys.exists(layout.certsDir)) {
      backend.makeFolder(layout.certsDir, 0o750);
      backend.chown(layout.certsDir, "root", layout.proxyGroup);
    }
    sys.writeFile(
      layout.caddyfile,
      nativeCaddyfile({
        domain: plan.proxy.options.domain,
        tls: plan.proxy.options.tls,
        ...(plan.proxy.options.email ? { email: plan.proxy.options.email } : {}),
        // Caddy (Go) reads C:/… on Windows, and its Caddyfile may read a backslash as an escape.
        certsDir:
          layout.platform === "win32" ? layout.certsDir.replaceAll("\\", "/") : layout.certsDir,
        upstream: plan.proxy.upstream,
      }),
      0o644,
    );
    folders.push(layout.proxyDataDir, layout.proxySettingsDir);
  }
  // Log files (macOS): launchd doesn't create their folder, and each belongs to its service's account.
  for (const definition of [plan.app, ...(plan.proxy ? [plan.proxy] : [])])
    if (definition.logFile) {
      backend.makeFolder(dirname(definition.logFile), 0o755);
      if (!sys.exists(definition.logFile)) sys.writeFile(definition.logFile, "", 0o644);
      backend.chown(definition.logFile, definition.user, definition.group);
    }
  // A log folder (Windows): WinSW writes each service's files in it, as that service's account.
  for (const definition of [plan.app, ...(plan.proxy ? [plan.proxy] : [])])
    if (definition.logDir) {
      backend.makeFolder(definition.logDir, 0o750);
      backend.chown(definition.logDir, definition.user, definition.group);
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

  // The services. Their folder is the system's on Linux and macOS, Ronne's own on Windows.
  const definitions = (layout.platform === "win32" ? win32 : posix).dirname(layout.definition);
  if (!sys.exists(definitions)) backend.makeFolder(definitions, 0o755);
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

  // The firewall: the port, when it listens beyond this machine and nothing proxies it; the proxy's
  // 80 and 443 on every network (a certificate authority must reach 80, people 443).
  if (isWildcard(options.host) && !plan.proxy) backend.allowInbound(plan.app.name, [options.port]);
  else backend.removeInbound(plan.app.name);
  if (plan.proxy) backend.allowInbound(plan.proxy.name, [80, 443], true);
  else backend.removeInbound(PROXY_NAME);

  // Wait until it answers: 503 before the setup, 200 after.
  const healthUrl = `http://${upstreamFor(options.host, options.port)}/api/health`;
  sys.out(
    `Started ${plan.app.name}; waiting for it to answer at ${healthUrl} (up to ${HEALTH_WAIT_MS / 1000} seconds)…\n`,
  );
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
      `Ronne AI Marketplace is running as a service (${plan.app.name}), started at boot and restarted if it stops.`,
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
  backend.removeInbound(plan.app.name);
  backend.removeInbound(PROXY_NAME);
  sys.remove(layout.caddyfile);
  sys.remove(statePath(layout));
  // Only the two accounts install makes: service.json sits in a folder the server's account can
  // write, so its list isn't trusted with anything else.
  const accounts: [string, string][] = [
    [layout.user, layout.group],
    [layout.proxyUser, layout.proxyGroup],
  ];
  for (const [user, group] of accounts)
    if (user !== "root" && (layout.systemUser || user !== layout.user))
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
      `Removed the rmk-server service. The data stays in ${layout.dataDir} and the settings in ${layout.envFile}: ${asAdmin(sys, "rmk-server service install")} uses them again.\n`,
    );
  return 0;
};
