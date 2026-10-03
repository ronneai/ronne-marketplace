import { marketplaceName } from "@ronneai/core/plugins";
import { rmkVersion } from "./api.js";
import type { Wanted } from "./apply.js";
import { connectRegistry } from "./connect.js";
import { usage } from "./errors.js";
import type { Scope } from "./install.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { applyOwnEntries } from "./own-entries.js";

/**
 * `rmk plugin-setup claude-code [--scope user|project] [--remove] [--static-headers]`
 * (feature 077): adds the registry's plugin marketplace to Claude Code's settings, as
 * `extraKnownMarketplaces.<ronne-host>`, with `rmk auth headers` as its `headersHelper`. The key
 * goes through the applier as a `json-key` change under `rmk plugin-setup` in the state file, so
 * an entry the person made or edited is a conflict, never overwritten, and `--remove` takes
 * exactly it away.
 */
type Args = {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
};

export const PLUGIN_SETUP_ITEM = "rmk plugin-setup";

export const PLUGIN_SETUP_USAGE =
  "rmk plugin-setup claude-code [--scope user|project] [--remove] [--static-headers] [--command <rmk>]";

/** The tools whose marketplace the registry serves itself (077); Codex and Cursor come with 078. */
const TOOLS = ["claude-code"];

const SETTINGS = ".claude/settings.json";

/** The registry's Claude Code marketplace, as the instance serves it (contract, Endpoints). */
export const marketplaceUrlOf = (registry: string) =>
  `${registry}/api/v1/feeds/claude-code/marketplace.json`;

const scopeOf = (value: string | boolean | string[] | undefined): Scope => {
  if (value === undefined || value === "user") return "user";
  if (value === "project") return "project";
  throw usage("--scope is user or project.");
};

/** Claude Code reads a URL marketplace's archives only over HTTPS, and never from loopback. */
const reachableByClaudeCode = (registry: string) => {
  const { protocol, hostname } = new URL(registry);
  const loopback = hostname === "localhost" || hostname.startsWith("127.") || hostname === "[::1]";
  return protocol === "https:" && !loopback;
};

export const pluginSetupCommand = async (io: Io, args: Args, out: Output) => {
  const [tool, ...rest] = args.positionals;
  if (!tool || rest.length) throw usage(`Usage: ${PLUGIN_SETUP_USAGE}`);
  if (!TOOLS.includes(tool))
    throw usage(
      `rmk plugin-setup only sets up claude-code: Codex and Cursor read plugins from a git mirror instead.`,
    );
  const scope = scopeOf(args.values.scope);
  const remove = args.values.remove === true;
  const staticHeaders = args.values["static-headers"] === true;
  if (staticHeaders && scope === "project")
    throw usage(
      "--static-headers writes your token into the settings file, so it's only allowed with --scope user: a project's .claude/settings.json usually goes into git.",
    );
  const rmk = (typeof args.values.command === "string" ? args.values.command : "rmk").trim();
  if (!rmk) throw usage("--command needs the command that runs rmk.");

  const wanted: Wanted[] = [];
  let name: string | null = null;
  let registryUrl: string | null = null;
  if (!remove) {
    const { registry } = connectRegistry(io, {
      registry: typeof args.values.registry === "string" ? args.values.registry : undefined,
      insecure: args.values.insecure === true,
      project: scope === "project",
    });
    registryUrl = registry.url;
    name = marketplaceName(registry.url);
    const source: Record<string, unknown> = { source: "url", url: marketplaceUrlOf(registry.url) };
    if (staticHeaders) source.headers = { Authorization: `Bearer ${registry.token}` };
    else source.headersHelper = `${rmk} auth headers --registry ${registry.url}`;
    wanted.push({
      item: PLUGIN_SETUP_ITEM,
      version: rmkVersion(),
      targets: ["claude-code"],
      change: {
        kind: "json-key",
        path: SETTINGS,
        key: ["extraKnownMarketplaces", name],
        value: { source },
      },
    });
  }

  const plan = await applyOwnEntries(scope, io, PLUGIN_SETUP_ITEM, wanted, {
    force: args.values.force === true,
    out,
    what: "a marketplace entry",
  });
  const written = plan.writes.map((w) => w.entry.path);
  const removed = plan.removes.map((e) => e.path);
  const where = scope === "user" ? `~/${SETTINGS}` : SETTINGS;
  out.set("tool", tool);
  out.set("scope", scope);
  out.set("written", written);
  out.set("removed", removed);
  if (remove) {
    out.say(
      removed.length
        ? `Removed the registry's plugin marketplace from Claude Code (${where}).`
        : "The registry's plugin marketplace wasn't set up here.",
    );
    return;
  }
  out.set("marketplace", name);
  out.set("registry", registryUrl);
  out.say(
    written.length
      ? `Added the plugin marketplace ${name} to Claude Code (${where}).`
      : `The plugin marketplace ${name} is already in Claude Code (${where}).`,
  );
  out.say(
    `Next: run /plugin in Claude Code and open the Marketplaces tab, or install one with /plugin install <scope>.<name>@${name}.`,
  );
  if (staticHeaders)
    out.say(
      "Note: the token is written into the settings file. Run rmk plugin-setup claude-code --static-headers again after rmk login.",
    );
  else
    out.say(
      `Note: Claude Code runs \`${rmk} auth headers\` from ~/.claude to send your token, so ${rmk} must be on its PATH (or pass --command with its full path).`,
    );
  if (scope === "project")
    out.say(
      "Note: Claude Code reads a project's marketplaces only once you trust the folder. Commit .claude/settings.json to share it; each person still needs rmk login.",
    );
  if (registryUrl && !reachableByClaudeCode(registryUrl))
    out.say(
      `Warning: ${registryUrl} isn't an HTTPS address Claude Code will download plugins from (it refuses http:// and loopback hosts).`,
    );
};
