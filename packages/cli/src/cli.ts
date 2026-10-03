import { parseArgs } from "node:util";
import { ApiError, apiClient, checkRegistryUrl, rmkVersion } from "./api.js";
import { authCommand } from "./auth.js";
import { REGISTRY_SOURCE, readUserConfig, resolveRegistry, writeUserConfig } from "./config.js";
import { connectRegistry } from "./connect.js";
import { RmkError, usage } from "./errors.js";
import { exportCommand } from "./export-command.js";
import { installCommand } from "./install.js";
import type { Io } from "./io.js";
import { outdatedCommand, removeCommand, updateCommand } from "./manage.js";
import { mcpSetupCommand } from "./mcp-setup.js";
import { done, failed, output, type RunResult } from "./output.js";
import { pluginSetupCommand } from "./plugin-setup.js";
import { list, platforms, withApi } from "./registry-commands.js";
import { submitCommand } from "./submit.js";
import { flushAfterCommand, refreshPolicy, usageNotice } from "./telemetry.js";
import { telemetryCommand } from "./telemetry-command.js";

/**
 * `rmk` (feature 022, MVP §6): the commands, their arguments, and the exit codes. Each command is
 * a small function over an `Io`, so tests run them against a fake registry and a temporary folder.
 */
export const USAGE = `Usage: rmk <command> [options]

  login [--registry <url>] [--token <token>] [--insecure]
  logout
  whoami
  auth headers [--registry <url>]
  platforms
  search <query> [--type <type>] [--scope <scope>] [--target <tool>]
  info <item>[@version]
  list [--installed]
  install [<item>[@tag|range]...] [--target <ids>|all] [--scope project|user] [--force]
  update [<item>...]
  outdated
  remove <item>...
  mcp-setup [--target <ids>|all] [--scope project|user] [--remove] [--command <cmd>]
  plugin-setup claude-code [--scope user|project] [--remove] [--static-headers] [--command <rmk>]
  export [<path|name>...] [--to <@scope>] [--type <type>] [--from <tool>] [--name <name>]
         [--description <text>] [--with-deps | --no-deps] [--scope project|user]
         [--describe <item>=<text>]... [--descriptions <file.json>]
         [--dry-run] [--yes] [--force] [--new] [--new-draft]
  submit [<@scope/name|id>...] [--all] [--no-deps] [--dry-run] [--yes]
  telemetry [on | off | status | preview | flush]

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
  remove: { type: "boolean" },
  command: { type: "string" },
  to: { type: "string" },
  name: { type: "string" },
  yes: { type: "boolean", short: "y" },
  "dry-run": { type: "boolean" },
  description: { type: "string" },
  "with-deps": { type: "boolean" },
  from: { type: "string" },
  new: { type: "boolean" },
  "new-draft": { type: "boolean" },
  all: { type: "boolean" },
  describe: { type: "string", multiple: true },
  descriptions: { type: "string" },
  "no-deps": { type: "boolean" },
  "static-headers": { type: "boolean" },
} as const;

export type Args = {
  values: Record<string, string | boolean | string[] | undefined>;
  positionals: string[];
};

const parse = (argv: string[]): Args => {
  try {
    return parseArgs({ args: argv, options: OPTIONS, allowPositionals: true }) as Args;
  } catch (error) {
    throw usage(`${(error as Error).message}\n\n${USAGE}`);
  }
};

const str = (value: string | boolean | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

const connect = (io: Io, args: Args, needToken = true) =>
  connectRegistry(io, {
    registry: str(args.values.registry),
    insecure: args.values.insecure === true,
    needToken,
  });

/** For commands whose `--scope user` means the home folder: the project's registry doesn't apply. */
const connectScoped = (io: Io, args: Args) =>
  connectRegistry(io, {
    registry: str(args.values.registry),
    insecure: args.values.insecure === true,
    project: args.values.scope !== "user",
  });

const login = async (io: Io, args: Args, out: ReturnType<typeof output>) => {
  const config = readUserConfig(io);
  const resolved = resolveRegistry(io, config, str(args.values.registry));
  if (!resolved) throw usage("Say which registry: rmk login --registry https://ronne.example");
  const { url } = resolved;
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
  // The registry named with --registry becomes the default; one from the env or a project doesn't.
  const previous = config.defaultRegistry;
  if (!previous || resolved.source === "flag") config.defaultRegistry = url;
  writeUserConfig(io, config);
  out.set("registry", url);
  out.set("email", email);
  out.set("defaultRegistry", config.defaultRegistry);
  out.say(`Logged in to ${url} as ${email}.`);
  if (previous && previous !== config.defaultRegistry)
    out.say(`It's now the default registry, instead of ${previous}.`);
  // The registry's usage policy, and its notice when rmk will report there (046).
  await refreshPolicy(io, url, token, { force: true });
  const notice = usageNotice(io, url);
  if (notice) out.say(notice);
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
  out.set("registrySource", registry.source);
  out.set("user", { id: me.id, email: me.email, name: me.name, role: me.role });
  out.set("token", me.token);
  out.say(
    `${me.name} <${me.email}> (${me.role}) at ${registry.url} (from ${REGISTRY_SOURCE[registry.source]}), with the token "${me.token.name}".`,
  );
};

export type Command = (io: Io, args: Args, out: ReturnType<typeof output>) => Promise<void>;

const { search, info } = withApi((io, args) => connect(io, args));

const install: Command = (io, args, out) =>
  installCommand(io, args, out, connectScoped(io, args).api);
const update: Command = (io, args, out) =>
  updateCommand(io, args, out, connectScoped(io, args).api);
const outdated: Command = (io, args, out) =>
  outdatedCommand(io, args, out, connectScoped(io, args).api);
const remove: Command = (io, args, out) =>
  removeCommand(io, args, out, connectScoped(io, args).api);

export const COMMANDS: Record<string, Command> = {
  login,
  logout,
  whoami,
  search,
  info,
  list,
  platforms,
  install,
  update,
  outdated,
  remove,
  "mcp-setup": (io, args, out) => mcpSetupCommand(io, args, out),
  "plugin-setup": (io, args, out) => pluginSetupCommand(io, args, out),
  export: (io, args, out) => exportCommand(io, args, out, connect(io, args).api),
  submit: (io, args, out) => submitCommand(io, args, out, connect(io, args).api),
  telemetry: (io, args, out) => telemetryCommand(io, args, out),
  auth: (io, args, out) => authCommand(io, args, out),
};

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
    // Asking for help isn't a usage error; running rmk with no command is.
    return done(out, name || args.values.help ? 0 : 2);
  }
  const command = COMMANDS[name];
  if (!command) return failed(out, usage(`rmk doesn't have a \`${name}\` command.\n\n${USAGE}`));
  try {
    await command(io, { values: args.values, positionals: rest }, out);
    return done(out);
  } catch (error) {
    return failed(out, error);
  } finally {
    // Queued usage goes out at the end of a command (046); `rmk telemetry` sends only on `flush`,
    // and `rmk auth` never: Claude Code gives its headersHelper 10 seconds (077).
    if (name !== "telemetry" && name !== "auth") await flushAfterCommand(io);
  }
};
