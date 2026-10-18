import type { Manifest } from "@ronneai/core";
import { apiClient, rmkVersion } from "./api.js";
import type { Wanted } from "./apply.js";
import { readUserConfig, resolveRegistry, tokenFor, writeUserConfig } from "./config.js";
import { usage } from "./errors.js";
import { chooseTargets, MCP_SETUP_ITEM, places, scopeOf, toolNotes } from "./install.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { applyOwnEntries } from "./own-entries.js";
import { readProjectConfig } from "./project.js";
import { defaultTokenName, webLogin } from "./web-login.js";

/**
 * `rmk mcp-setup [--target <ids>|all] [--scope project|user] [--remove] [--command <cmd>]`
 * (feature 027): registers the registry MCP server with each AI tool, through that tool's own
 * renderer, as if it were an `mcp-server` item named `ronne-registry`. Its entries go in the state
 * file under `rmk mcp-setup`, so installs leave them alone, `--remove` takes exactly them away, and
 * an entry the person made is a conflict, never overwritten.
 */
type Args = {
  positionals: string[];
  values: Record<string, string | boolean | string[] | undefined>;
};

export const SERVER_NAME = "ronne-registry";

const serverManifest = (command: string[]): Manifest =>
  ({
    name: `@rmk/${SERVER_NAME}`,
    type: "mcp-server",
    description: "Search and install items from a Ronne AI Marketplace.",
    "mcp-server": {
      transport: "stdio",
      command: command[0],
      ...(command.length > 1 ? { args: command.slice(1) } : {}),
    },
  }) as unknown as Manifest;

/**
 * The server uses the token `rmk login` saved (107): without one, `rmk mcp-setup` offers to sign in
 * in the browser first, as `rmk login --web` does. `--yes` signs in without asking; without a
 * terminal it only says what to run.
 */
const offerWebLogin = async (io: Io, args: Args, out: Output, project: boolean) => {
  const config = readUserConfig(io);
  const override = typeof args.values.registry === "string" ? args.values.registry : undefined;
  const registry = resolveRegistry(io, config, override, project);
  if (!registry) {
    out.say(
      "Note: no registry yet. Run `rmk login --web --registry <url>`, and the server uses its token.",
    );
    return;
  }
  if (tokenFor(io, config, registry.url)) return;
  const later = `Note: you're not logged in to ${registry.url}. Run \`rmk login --web\` (or \`rmk login\`) so the server has a token.`;
  if (!io.interactive) {
    out.say(later);
    return;
  }
  if (args.values.yes !== true) {
    const answer = await io.prompt(
      `You're not logged in to ${registry.url}, and the server needs a token. Sign in in the browser now? [Y/n] `,
    );
    if (/^n/i.test(answer.trim())) {
      out.say(later);
      return;
    }
  }
  const name =
    (typeof args.values.name === "string" ? args.values.name : undefined) ?? defaultTokenName(io);
  const created = await webLogin(io, registry.url, {
    name,
    openBrowser: args.values["no-browser"] !== true,
  });
  const email = (await apiClient(io.fetch, registry.url, created.token).me()).email;
  config.registries[registry.url] = { token: created.token, email };
  config.defaultRegistry ??= registry.url;
  writeUserConfig(io, config);
  out.set("loggedIn", { registry: registry.url, email });
  out.say(`Logged in to ${registry.url} as ${email}.`);
};

export const mcpSetupCommand = async (io: Io, args: Args, out: Output) => {
  const scope = scopeOf(typeof args.values.scope === "string" ? args.values.scope : undefined);
  const remove = args.values.remove === true;
  const command = (typeof args.values.command === "string" ? args.values.command : "rmk-mcp")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (command.length === 0) throw usage("--command needs the command that starts rmk-mcp.");
  if (!remove) await offerWebLogin(io, args, out, scope === "project");
  const config = scope === "project" ? readProjectConfig(io.cwd) : null;
  const targets = await chooseTargets(
    io,
    typeof args.values.target === "string" ? args.values.target : undefined,
    config?.targets,
    out,
  );
  const version = rmkVersion();
  const wanted: Wanted[] = [];
  const warnings: string[] = [];
  if (!remove)
    for (const target of targets) {
      const result = target.render(
        { name: `@rmk/${SERVER_NAME}`, version, manifest: serverManifest(command), files: [] },
        { scope, targets: targets.map((t) => t.id) },
      );
      warnings.push(...result.warnings.map((w) => `${target.name}: ${w.message}`));
      for (const change of result.changes)
        wanted.push({ item: MCP_SETUP_ITEM, version, targets: [target.id], change });
    }

  const plan = await applyOwnEntries(scope, io, MCP_SETUP_ITEM, wanted, {
    force: args.values.force === true,
    out,
    what: "an MCP server entry",
  });

  const written = plan.writes.map((w) => w.entry.path);
  const removed = plan.removes.map((e) => e.path);
  out.set(
    "targets",
    targets.map((t) => t.id),
  );
  out.set("written", written);
  out.set("removed", removed);
  if (remove)
    out.say(
      removed.length
        ? `Removed the registry MCP server from ${[...new Set(removed)].join(", ")}.`
        : "The registry MCP server wasn't set up here.",
    );
  else {
    out.say(
      written.length
        ? `Registered the registry MCP server (${command.join(" ")}) for ${targets.map((t) => t.id).join(", ")}:`
        : `The registry MCP server is already registered for ${targets.map((t) => t.id).join(", ")}.`,
    );
    for (const path of written) out.say(`  wrote ${path} (a setting)`);
    for (const w of warnings) out.say(`Warning: ${w}`);
    if (written.length && scope === "project" && targets.some((t) => t.id === "claude-code"))
      out.say(
        "Note: Claude Code asks once before it uses a project's MCP servers: approve ronne-registry.",
      );
    for (const note of toolNotes(written, scope, places(io, scope).root)) out.say(`Note: ${note}`);
    if (written.length)
      out.say(
        "Restart the AI tool, or reload its MCP servers, to start it. It uses the token from rmk login.",
      );
  }
};
