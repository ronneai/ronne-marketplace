// rmk-server's arguments (feature 082): what to run, and where it listens.
import { isAbsolute, resolve } from "node:path";
import { DEFAULT_HOST, DEFAULT_PORT } from "./defaults.js";
import { parseServiceArgs, type ServiceCommand } from "./service/args.js";

type Env = Record<string, string | undefined>;

/** The scripts the web app compiles to dist-scripts/, which rmk-server runs as they are. */
export const SCRIPTS = [
  "setup",
  "migrate",
  "reset-root-password",
  "revoke-access",
  "reset-two-factor",
  "rotate-secret",
  "disable-sso",
  "backup",
  "restore",
  "purge",
] as const;
export type Script = (typeof SCRIPTS)[number];

export { DEFAULT_HOST, DEFAULT_PORT };

export type Command =
  | { kind: "start"; port: number; host: string; open: boolean }
  | { kind: "script"; script: Script; args: string[]; port: number }
  | Exclude<ServiceCommand, { kind: "error" }>
  | { kind: "version" }
  | { kind: "help" }
  | { kind: "error"; message: string };

const isScript = (name: string): name is Script => (SCRIPTS as readonly string[]).includes(name);

const parsePort = (value: string | undefined): number | undefined => {
  if (value === undefined || !/^\d+$/.test(value)) return undefined;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : undefined;
};

/** The port from PORT, or 7650. */
const envPort = (env: Env): number => parsePort(env.PORT) ?? DEFAULT_PORT;

export const parseArgs = (argv: string[], env: Env = process.env): Command => {
  const [first, ...rest] = argv;
  if (first === "--version" || first === "-v") return { kind: "version" };
  if (first === "--help" || first === "-h" || first === "help") return { kind: "help" };
  if (first === "service") return parseServiceArgs(rest);
  // The scripts keep their own flags (setup's --yes, --database-url, …).
  if (first !== undefined && isScript(first))
    return { kind: "script", script: first, args: rest, port: envPort(env) };

  const args = first === "start" ? rest : argv;
  let port = envPort(env);
  let host = env.HOST || DEFAULT_HOST;
  let open = true;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? arg.split(/=(.*)/s) : [arg];
    const value = (): string | undefined => (inline !== undefined ? inline : args[++i]);
    if (name === "--port") {
      const raw = value();
      const parsed = parsePort(raw);
      if (parsed === undefined)
        return {
          kind: "error",
          message: `--port needs a port from 1 to 65535, not ${raw ?? "nothing"}.`,
        };
      port = parsed;
    } else if (name === "--host") {
      const raw = value();
      if (!raw) return { kind: "error", message: "--host needs an address, such as 0.0.0.0." };
      host = raw;
    } else if (name === "--no-open") {
      open = false;
    } else {
      return {
        kind: "error",
        message: `Unknown option or command: ${arg}. See rmk-server --help.`,
      };
    }
  }
  return { kind: "start", port, host, open };
};

/** The flags whose value is a path, per script: the script may run in another folder. */
const PATH_FLAGS: Partial<Record<Script, string[]>> = {
  backup: ["--out", "--passphrase-file", "--verify"],
  restore: ["--passphrase-file"],
};

/**
 * Per script, the flags that take a value (so it isn't read as a positional argument), when the
 * script's positional arguments are paths too (restore's archive).
 */
const VALUE_FLAGS: Partial<Record<Script, string[]>> = {
  restore: ["--passphrase-file", "--database-url"],
};

/**
 * A script's arguments with each path flag's value made absolute from `cwd`, where the person
 * typed the command: with the service installed, the script runs elsewhere (in `/`, as the
 * service's account), where a relative path would mean another folder.
 */
export const scriptArgs = (script: Script, args: string[], cwd: string): string[] => {
  const flags = PATH_FLAGS[script] ?? [];
  const valueFlags = VALUE_FLAGS[script];
  // A blank value stays blank, for the script to refuse.
  const absolute = (path: string) =>
    path.trim() === "" || isAbsolute(path) ? path : resolve(cwd, path);
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === "--") {
      // After `--` everything is positional: restore's archive is a path even there.
      out.push("--", ...args.slice(i + 1).map((a) => (valueFlags ? absolute(a) : a)));
      break;
    }
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? arg.split(/=(.*)/s) : [arg];
    // A positional path (restore's archive): anything that isn't a flag or a flag's value.
    if (valueFlags && !arg.startsWith("-")) out.push(absolute(arg));
    else if (valueFlags?.includes(arg) && !flags.includes(arg) && i + 1 < args.length)
      out.push(arg, args[++i] as string);
    else if (name === undefined || !flags.includes(name)) out.push(arg);
    else if (inline !== undefined) out.push(`${name}=${absolute(inline)}`);
    // A flag where the value should be is left for the script to refuse, never taken as a folder
    // (a lone `-` is a folder's name, as the script reads it).
    else if (i + 1 < args.length && !/^-./.test(args[i + 1] as string))
      out.push(arg, absolute(args[++i] as string));
    else out.push(arg);
  }
  return out;
};

export const HELP = `rmk-server: run Ronne AI Marketplace on this machine (Node.js 22.12 or later).

Usage:
  rmk-server [start] [--port N] [--host H] [--no-open]
      Start the server (http://localhost:7650 by default). Until the instance is set up, the
      browser shows the setup. On a terminal, the first start opens the browser.
  rmk-server setup [--yes …]      Set the instance up in the terminal instead
  rmk-server migrate              Apply pending database migrations and exit
  rmk-server reset-root-password  Set a new password for root
  rmk-server revoke-access --everyone | --user EMAIL [--sessions-only | --tokens-only] [--yes]
                                  End sessions and revoke access tokens (for incidents)
  rmk-server reset-two-factor --email EMAIL [--yes]
                                  Turn off an account's two-factor sign-in (a lost phone)
  rmk-server rotate-secret [--yes]
                                  Write a new AUTH_SECRET; everyone signs in again (for incidents)
  rmk-server disable-sso [--yes]  Turn every identity provider off; everyone may use a password again
  rmk-server purge [--dry-run]    Clear personal data past the retention now (the server does it
                                  every six hours on its own unless RONNE_JOBS=off)
  rmk-server backup [--out DIR] [--encrypt] [--no-settings] [--keep N]
                                  Make a backup archive while it runs (see rmk-server backup --help)
  rmk-server backup --verify ARCHIVE [--passphrase-file FILE]
                                  Check an archive's checksums and say what's in it
  rmk-server restore ARCHIVE [--passphrase-file FILE] [--database-url URL] [--with-settings] [--yes]
                                  Restore a backup into an empty database (stop the server first)
  rmk-server service …            Run it as a service, started at boot (see rmk-server service --help)
  rmk-server --version | --help

Options:
  --port N    Port to listen on (or PORT). Default 7650
  --host H    Address to listen on (or HOST). Default 127.0.0.1, this machine only;
              0.0.0.0 makes it reachable from the network
  --no-open   Don't open the browser

The data (database, stored items, settings) lives in RONNE_DATA_DIR, or by default:
  macOS    ~/Library/Application Support/RonneAI Marketplace
  Linux    $XDG_DATA_HOME/rmk-server, else ~/.local/share/rmk-server
  Windows  %LOCALAPPDATA%\\RonneAI\\Marketplace (in a terminal only; no service)
`;
