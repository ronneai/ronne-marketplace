// `rmk-server service …`'s arguments (feature 083).
import { DEFAULT_HOST, DEFAULT_PORT } from "../defaults.js";
import { TLS_MODES, type TlsMode } from "./model.js";

export const SERVICE_ACTIONS = [
  "install",
  "uninstall",
  "status",
  "start",
  "stop",
  "restart",
  "logs",
] as const;
export type ServiceAction = (typeof SERVICE_ACTIONS)[number];

export type InstallOptions = {
  port: number;
  host: string;
  domain?: string;
  tls: TlsMode;
  email?: string;
  /** macOS: run as the signed-in user. */
  user: boolean;
};

export type ServiceCommand =
  | { kind: "service"; action: "install"; options: InstallOptions }
  | { kind: "service"; action: "uninstall"; deleteData: boolean }
  | { kind: "service"; action: Exclude<ServiceAction, "install" | "uninstall"> }
  | { kind: "service-help" }
  | { kind: "error"; message: string };

// A host name as Caddy's site address takes it: labels of letters, digits and inner hyphens, so
// nothing that could end the line or open a block in the Caddyfile. A loop, not one regex
// (docs/knowledge/codeql-regex.md).
const LABEL = /^[A-Za-z0-9-]{1,63}$/;
export const isDomain = (value: string): boolean =>
  value.length <= 253 &&
  value
    .split(".")
    .every((label) => LABEL.test(label) && !label.startsWith("-") && !label.endsWith("-"));
const EMAIL = /^[^\s@{}"]+@[^\s@{}"]+$/;
const HOST = /^[A-Za-z0-9.:[\]-]+$/;

const parsePort = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : undefined;
};

const isAction = (word: string | undefined): word is ServiceAction =>
  (SERVICE_ACTIONS as readonly (string | undefined)[]).includes(word);

/** Parses what follows `rmk-server service`. */
export const parseServiceArgs = (argv: string[]): ServiceCommand => {
  const [action, ...args] = argv;
  if (action === undefined || action === "--help" || action === "-h" || action === "help")
    return { kind: "service-help" };
  if (!isAction(action))
    return {
      kind: "error",
      message: `Unknown service command: ${action}. See rmk-server service --help.`,
    };

  const options: InstallOptions = {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    tls: "auto",
    user: false,
  };
  let deleteData = false;
  const allowed: Record<ServiceAction, string[]> = {
    install: ["--port", "--host", "--domain", "--tls", "--email", "--user"],
    uninstall: ["--delete-data"],
    status: [],
    start: [],
    stop: [],
    restart: [],
    logs: [],
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? arg.split(/=(.*)/s) : [arg];
    if (!name || !allowed[action].includes(name))
      return {
        kind: "error",
        message: `Unknown option for service ${action}: ${arg}. See rmk-server service --help.`,
      };
    const value = (): string | undefined => (inline !== undefined ? inline : args[++i]);
    if (name === "--port") {
      const raw = value();
      const port = parsePort(raw);
      if (port === undefined)
        return {
          kind: "error",
          message: `--port needs a port from 1 to 65535, not ${raw ?? "nothing"}.`,
        };
      options.port = port;
    } else if (name === "--host") {
      const raw = value();
      if (!raw || !HOST.test(raw))
        return { kind: "error", message: "--host needs an address, such as 0.0.0.0." };
      options.host = raw;
    } else if (name === "--domain") {
      const raw = value();
      if (!raw || !isDomain(raw))
        return {
          kind: "error",
          message: `--domain needs a host name, such as ronne.example.com, not ${raw ?? "nothing"}.`,
        };
      options.domain = raw.toLowerCase();
    } else if (name === "--tls") {
      const raw = value();
      if (!raw || !(TLS_MODES as readonly string[]).includes(raw))
        return {
          kind: "error",
          message: `--tls is one of ${TLS_MODES.join(", ")}, not ${raw ?? "nothing"}.`,
        };
      options.tls = raw as TlsMode;
    } else if (name === "--email") {
      const raw = value();
      if (!raw || !EMAIL.test(raw))
        return { kind: "error", message: `--email needs an address, not ${raw ?? "nothing"}.` };
      options.email = raw;
    } else if (name === "--user") {
      options.user = true;
    } else if (name === "--delete-data") {
      deleteData = true;
    }
  }
  if (action === "install") {
    if (!options.domain && (options.email || args.some((a) => a.startsWith("--tls"))))
      return { kind: "error", message: "--tls and --email go with --domain." };
    return { kind: "service", action, options };
  }
  if (action === "uninstall") return { kind: "service", action, deleteData };
  return { kind: "service", action };
};

export const SERVICE_HELP = `rmk-server service: run Ronne in the background, started at boot and restarted if it stops
(systemd on Linux, launchd on macOS). Each command needs sudo, except status.

Usage:
  sudo rmk-server service install [--port N] [--host H] [--domain D [--tls T] [--email E]] [--user]
      Install and start the service, or update it (the data stays). Then open the address it
      prints and finish the setup.
  rmk-server service status        Installed or not, running or not, version, address, folders
  sudo rmk-server service start | stop | restart
  sudo rmk-server service logs     Follow the log (journalctl, or the log files on macOS)
  sudo rmk-server service uninstall [--delete-data]
      Stop and remove the service. The data and settings stay unless --delete-data, which asks
      you to type the data folder's name.

Options for install:
  --port N      Port the server listens on. Default 7650
  --host H      Address it listens on. Default 127.0.0.1, this machine only; 0.0.0.0 opens it
                to the network over plain HTTP, so put it behind HTTPS
  --domain D    Serve https://D through Caddy (a second service, rmk-server-proxy, on 80 and 443).
                Needs caddy 2.7 or later on PATH
  --tls T       auto (Let's Encrypt, the default), internal (Caddy's own authority) or files
                (copies of cert.pem and key.pem you put in
                /etc/rmk-server-proxy/certs; on macOS, the prefix's etc/rmk-server-proxy/certs)
  --email E     Expiry notices from the certificate authority
  --user        macOS: run as you instead of a system user

With the service installed, sudo rmk-server setup, migrate and reset-root-password work on its
data, as its account.

Where things are:
  Linux   data /var/lib/rmk-server, settings /etc/rmk-server/env, logs: journalctl -u rmk-server
  macOS   data /usr/local/var/rmk-server (Homebrew: $(brew --prefix)/var/rmk-server),
          settings …/etc/rmk-server/env, logs /Library/Logs/rmk-server/server.log
`;
