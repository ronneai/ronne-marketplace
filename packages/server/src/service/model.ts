// The service model (feature 083): what runs, as whom, with which folders and settings, described
// once for every system. The renderers turn a definition into a systemd unit or a launchd plist;
// Windows (086) adds a WinSW renderer for the same definitions.
import {
  LAUNCHD_LABEL,
  PROXY_LAUNCHD_LABEL,
  PROXY_NAME,
  SERVICE_NAME,
  type ServiceLayout,
} from "./layout.js";

/** How the proxy gets its certificate, as in 080's RONNE_TLS. */
export type TlsMode = "auto" | "internal" | "files";
export const TLS_MODES: readonly TlsMode[] = ["auto", "internal", "files"];

export type ServiceDefinition = {
  /** The systemd and Windows service name. */
  name: string;
  /** launchd's label. */
  label: string;
  description: string;
  user: string;
  group: string;
  /** The program and its arguments, absolute paths only (services don't get the caller's PATH). */
  program: string;
  args: string[];
  workingDirectory: string;
  environment: Record<string, string>;
  /** The only folders it may write; everything else is read-only where the system allows it. */
  writablePaths: string[];
  /** Folders under /home or /root it reads from (its program), so they can't be hidden from it. */
  readsHome: boolean;
  /** Needs to listen on ports below 1024 without being root. */
  bindsLowPorts: boolean;
  /** Services this one starts after. */
  after: string[];
  /** Where its output goes, on systems without a journal. */
  logFile?: string;
};

export type ProxyOptions = {
  domain: string;
  tls: TlsMode;
  email?: string;
  /** Caddy's absolute path. */
  caddy: string;
};

export type ServiceOptions = {
  layout: ServiceLayout;
  /** The Node.js that runs rmk-server (process.execPath when installing). */
  node: string;
  /** rmk-server's own entry point (dist/bin.js), resolved through symlinks. */
  entry: string;
  port: number;
  host: string;
  proxy?: ProxyOptions;
};

export type ServicePlan = {
  layout: ServiceLayout;
  app: ServiceDefinition;
  proxy?: ServiceDefinition & { upstream: string; options: ProxyOptions };
  /** Settings install writes into the settings file (and leaves the rest as they are). */
  settings: Record<string, string>;
};

const inHome = (path: string): boolean => /^\/(home|root)(\/|$)/.test(path);

/** Where the proxy reaches the server: its own address, or this machine when it listens on all. */
export const upstreamFor = (host: string, port: number): string => {
  const local = host === "0.0.0.0" || host === "::" || host === "" ? "127.0.0.1" : host;
  return local.includes(":") ? `[${local}]:${port}` : `${local}:${port}`;
};

export const servicePlan = (options: ServiceOptions): ServicePlan => {
  const { layout, node, entry, port, host, proxy } = options;
  const app: ServiceDefinition = {
    name: SERVICE_NAME,
    label: LAUNCHD_LABEL,
    description: "Ronne AI Marketplace",
    user: layout.user,
    group: layout.group,
    program: node,
    args: [entry, "start", "--no-open", "--port", String(port), "--host", host],
    workingDirectory: layout.dataDir,
    environment: {
      NODE_ENV: "production",
      RONNE_DATA_DIR: layout.dataDir,
      // The app reads the settings file itself, so a setup finished in the browser applies without
      // a restart. Loading it into the environment instead would freeze its values at start.
      RONNE_ENV_FILE: layout.envFile,
    },
    // The settings file only, not its folder (root's): the setup rewrites the file in place.
    writablePaths: [layout.dataDir, layout.envFile],
    readsHome: inHome(node) || inHome(entry),
    bindsLowPorts: false,
    after: [],
    ...(layout.logFile ? { logFile: layout.logFile } : {}),
  };
  if (!proxy) return { layout, app, settings: {} };

  const caddyHome = layout.proxyDataDir;
  return {
    layout,
    app,
    proxy: {
      name: PROXY_NAME,
      label: PROXY_LAUNCHD_LABEL,
      description: "Ronne AI Marketplace's HTTPS proxy (Caddy)",
      user: layout.proxyUser,
      group: layout.proxyGroup,
      program: proxy.caddy,
      args: ["run", "--config", layout.caddyfile, "--adapter", "caddyfile"],
      workingDirectory: caddyHome,
      // Caddy keeps its certificates under XDG_DATA_HOME/caddy, its autosave under
      // XDG_CONFIG_HOME/caddy: both in the proxy's own folder, apart from a system Caddy's.
      environment: {
        HOME: caddyHome,
        XDG_DATA_HOME: caddyHome,
        XDG_CONFIG_HOME: caddyHome,
      },
      writablePaths: [caddyHome],
      readsHome: inHome(proxy.caddy),
      bindsLowPorts: layout.platform === "linux",
      after: [SERVICE_NAME],
      ...(layout.proxyLogFile ? { logFile: layout.proxyLogFile } : {}),
      upstream: upstreamFor(host, port),
      options: proxy,
    },
    settings: { PUBLIC_URL: `https://${proxy.domain}`, TRUST_PROXY: "true" },
  };
};
