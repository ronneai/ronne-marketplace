// Where `rmk-server service install` puts things on each system (feature 083). Windows (086)
// adds its own layout here.
import { posix } from "node:path";

export type ServicePlatform = "linux" | "darwin";

export type ServiceLayout = {
  platform: ServicePlatform;
  /** The account the server runs as, and its group. */
  user: string;
  group: string;
  /** True when the account is created by install (and removed by uninstall). */
  systemUser: boolean;
  /** root's group: root on Linux, wheel on macOS. */
  rootGroup: string;
  dataDir: string;
  /** The settings folder, the server's own: the setup rewrites the settings file in it. */
  settingsDir: string;
  envFile: string;
  /**
   * The proxy's folder, root's: the Caddyfile and the certificates for --tls files. Apart from the
   * settings folder, so the server's account can't change what the proxy runs or read its key.
   */
  proxySettingsDir: string;
  caddyfile: string;
  certsDir: string;
  /** Where the proxy's Caddy keeps its certificates and state. */
  proxyDataDir: string;
  /** The account the proxy runs as. */
  proxyUser: string;
  proxyGroup: string;
  /** The service definitions: a systemd unit or a launchd plist. */
  definition: string;
  proxyDefinition: string;
  /** Log files; none on Linux, where journald keeps them. */
  logFile?: string;
  proxyLogFile?: string;
};

export const SERVICE_NAME = "rmk-server";
export const PROXY_NAME = "rmk-server-proxy";
/** launchd's labels, reverse-DNS from ronne.ai. */
export const LAUNCHD_LABEL = "ai.ronne.rmk-server";
export const PROXY_LAUNCHD_LABEL = "ai.ronne.rmk-server-proxy";

export const serviceLayout = (options: {
  platform: ServicePlatform;
  /** macOS: Homebrew's prefix when rmk-server came from it, else /usr/local. */
  prefix?: string;
  /** macOS --user: the signed-in account instead of a system user. */
  user?: { name: string; group: string };
}): ServiceLayout => {
  if (options.platform === "linux")
    return {
      platform: "linux",
      user: SERVICE_NAME,
      group: SERVICE_NAME,
      systemUser: true,
      rootGroup: "root",
      dataDir: "/var/lib/rmk-server",
      settingsDir: "/etc/rmk-server",
      envFile: "/etc/rmk-server/env",
      proxySettingsDir: "/etc/rmk-server-proxy",
      caddyfile: "/etc/rmk-server-proxy/Caddyfile",
      certsDir: "/etc/rmk-server-proxy/certs",
      proxyDataDir: "/var/lib/rmk-server-proxy",
      proxyUser: "caddy",
      proxyGroup: "caddy",
      definition: `/etc/systemd/system/${SERVICE_NAME}.service`,
      proxyDefinition: `/etc/systemd/system/${PROXY_NAME}.service`,
    };

  const prefix = options.prefix ?? "/usr/local";
  const settingsDir = posix.join(prefix, "etc", "rmk-server");
  const proxySettingsDir = posix.join(prefix, "etc", "rmk-server-proxy");
  return {
    platform: "darwin",
    user: options.user?.name ?? "_rmkserver",
    group: options.user?.group ?? "_rmkserver",
    systemUser: !options.user,
    rootGroup: "wheel",
    dataDir: posix.join(prefix, "var", "rmk-server"),
    settingsDir,
    envFile: posix.join(settingsDir, "env"),
    proxySettingsDir,
    caddyfile: posix.join(proxySettingsDir, "Caddyfile"),
    certsDir: posix.join(proxySettingsDir, "certs"),
    proxyDataDir: posix.join(prefix, "var", "rmk-server-proxy"),
    // Binding 80 and 443 needs root on macOS.
    proxyUser: "root",
    proxyGroup: "wheel",
    definition: `/Library/LaunchDaemons/${LAUNCHD_LABEL}.plist`,
    proxyDefinition: `/Library/LaunchDaemons/${PROXY_LAUNCHD_LABEL}.plist`,
    logFile: "/Library/Logs/rmk-server/server.log",
    proxyLogFile: "/Library/Logs/rmk-server/proxy.log",
  };
};
