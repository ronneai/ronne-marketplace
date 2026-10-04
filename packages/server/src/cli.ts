// rmk-server's arguments (feature 082): what to run, and where it listens.
import { DEFAULT_HOST, DEFAULT_PORT } from "./defaults.js";
import { parseServiceArgs, type ServiceCommand } from "./service/args.js";

type Env = Record<string, string | undefined>;

/** The scripts the web app compiles to dist-scripts/, which rmk-server runs as they are. */
export const SCRIPTS = ["setup", "migrate", "reset-root-password"] as const;
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

export const HELP = `rmk-server: run Ronne AI Marketplace on this machine (Node.js 22.12 or later).

Usage:
  rmk-server [start] [--port N] [--host H] [--no-open]
      Start the server (http://localhost:7650 by default). Until the instance is set up, the
      browser shows the setup. On a terminal, the first start opens the browser.
  rmk-server setup [--yes …]      Set the instance up in the terminal instead
  rmk-server migrate              Apply pending database migrations and exit
  rmk-server reset-root-password  Set a new password for root
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
  Windows  %LOCALAPPDATA%\\RonneAI\\Marketplace
`;
