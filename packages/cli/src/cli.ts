import { parseArgs } from "node:util";
import { ApiError, apiClient, checkRegistryUrl, rmkVersion } from "./api.js";
import { normalizeRegistry, readUserConfig, registryFor, writeUserConfig } from "./config.js";
import { RmkError, usage } from "./errors.js";
import type { Io } from "./io.js";
import { done, failed, output, type RunResult } from "./output.js";

/**
 * `rmk` (feature 022, MVP §6): the commands, their arguments, and the exit codes. Each command is
 * a small function over an `Io`, so tests run them against a fake registry and a temporary folder.
 */
export const USAGE = `Usage: rmk <command> [options]

  login [--registry <url>] [--token <token>] [--insecure]
  logout
  whoami
  platforms
  search <query> [--type <type>] [--scope <scope>]
  info <item>[@version]
  list [--installed]
  install [<item>[@tag|range]...] [--target <ids>|all] [--scope project|user] [--force]
  update [<item>...]
  outdated
  remove <item>...

Options: --json (one JSON object per command), --registry <url>, --version, --help`;

const OPTIONS = {
  json: { type: "boolean" },
  version: { type: "boolean", short: "v" },
  help: { type: "boolean", short: "h" },
  registry: { type: "string" },
  token: { type: "string" },
  insecure: { type: "boolean" },
  type: { type: "string" },
  scope: { type: "string" },
  target: { type: "string" },
  installed: { type: "boolean" },
  force: { type: "boolean" },
} as const;

export type Args = { values: Record<string, string | boolean | undefined>; positionals: string[] };

const parse = (argv: string[]): Args => {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true }) as Args;
  } catch (error) {
    throw usage(`${(error as Error).message}\n\n${USAGE}`);
  }
};

const str = (value: string | boolean | undefined) =>
  typeof value === "string" ? value : undefined;

/** The registry and a client for it; `needToken` refuses to go on without one. */
const connect = (io: Io, args: Args, needToken = true) => {
  const config = readUserConfig(io);
  const registry = registryFor(io, config, str(args.values.registry));
  checkRegistryUrl(registry.url, args.values.insecure === true);
  if (needToken && !registry.token)
    throw new RmkError(
      `You're not logged in to ${registry.url}. Run \`rmk login\`.`,
      1,
      "not_logged_in",
    );
  return { config, registry, api: apiClient(io.fetch, registry.url, registry.token) };
};

const login = async (io: Io, args: Args, out: ReturnType<typeof output>) => {
  const config = readUserConfig(io);
  const url = normalizeRegistry(
    str(args.values.registry) || io.env.RMK_REGISTRY || config.defaultRegistry || "",
  );
  if (!url) throw usage("Say which registry: rmk login --registry https://ronne.example");
  checkRegistryUrl(url, args.values.insecure === true);
  let token = str(args.values.token);
  let email: string | undefined;
  if (token) {
    const me = await apiClient(io.fetch, url, token).me();
    email = me.email;
  } else {
    if (!io.interactive)
      throw usage(
        "No terminal to ask for a password: use `rmk login --token <token>`, or set RMK_TOKEN.",
      );
    email = (await io.prompt("Email: ")).trim();
    const password = await io.prompt("Password: ", { secret: true });
    const created = await apiClient(io.fetch, url, null).login(
      email,
      password,
      `rmk on ${io.env.HOSTNAME || io.env.COMPUTERNAME || "this machine"}`,
    );
    token = created.token;
  }
  config.registries[url] = { token, email };
  config.defaultRegistry ??= url;
  writeUserConfig(io, config);
  out.set("registry", url);
  out.set("email", email);
  out.say(`Logged in to ${url} as ${email}.`);
};

const logout = async (io: Io, args: Args, out: ReturnType<typeof output>) => {
  const { config, registry, api } = connect(io, args, false);
  if (registry.token && !io.env.RMK_TOKEN) {
    try {
      await api.logout();
    } catch (error) {
      // Revoked on the server or not, the token leaves this machine.
      if (!(error instanceof ApiError)) throw error;
      out.say(
        `Couldn't revoke the token on ${registry.url} (${error.message}); it's removed here anyway.`,
      );
    }
  }
  delete config.registries[registry.url];
  if (config.defaultRegistry === registry.url) delete config.defaultRegistry;
  writeUserConfig(io, config);
  out.set("registry", registry.url);
  out.say(`Logged out of ${registry.url}.`);
};

const whoami = async (io: Io, args: Args, out: ReturnType<typeof output>) => {
  const { registry, api } = connect(io, args);
  const me = await api.me();
  out.set("registry", registry.url);
  out.set("user", { id: me.id, email: me.email, name: me.name, role: me.role });
  out.set("token", me.token);
  out.say(
    `${me.name} <${me.email}> (${me.role}) at ${registry.url}, with the token "${me.token.name}".`,
  );
};

export type Command = (io: Io, args: Args, out: ReturnType<typeof output>) => Promise<void>;

export const COMMANDS: Record<string, Command> = { login, logout, whoami };

/** Runs rmk with the given arguments (without the node and script paths). */
export const run = async (argv: string[], io: Io): Promise<RunResult> => {
  let args: Args;
  try {
    args = parse(argv);
  } catch (error) {
    return failed(output(argv.includes("--json")), error);
  }
  const out = output(args.values.json === true);
  if (args.values.version) {
    out.set("version", rmkVersion());
    out.say(rmkVersion());
    return done(out);
  }
  const [name, ...rest] = args.positionals;
  if (!name || args.values.help) {
    out.say(USAGE);
    return done(out, name ? 0 : 2);
  }
  const command = COMMANDS[name];
  if (!command) return failed(out, usage(`rmk doesn't have a \`${name}\` command.\n\n${USAGE}`));
  try {
    await command(io, { values: args.values, positionals: rest }, out);
    return done(out);
  } catch (error) {
    return failed(out, error);
  }
};
