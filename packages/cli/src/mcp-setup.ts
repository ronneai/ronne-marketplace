import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Manifest } from "@ronneai/core";
import { rmkVersion } from "./api.js";
import { applyPlan, planChanges, readState, type Wanted, writeState } from "./apply.js";
import { RmkError, usage } from "./errors.js";
import { chooseTargets, MCP_SETUP_ITEM, places, scopeOf, toolNotes } from "./install.js";
import type { Io } from "./io.js";
import type { Output } from "./output.js";
import { readProjectConfig } from "./project.js";

/**
 * `rmk mcp-setup [--target <ids>|all] [--scope project|user] [--remove] [--command <cmd>]`
 * (feature 027): registers the registry MCP server with each AI tool, through that tool's own
 * renderer, as if it were an `mcp-server` item named `ronne-registry`. Its entries go in the state
 * file under `rmk mcp-setup`, so installs leave them alone, `--remove` takes exactly them away, and
 * an entry the person made is a conflict, never overwritten.
 */
type Args = { positionals: string[]; values: Record<string, string | boolean | undefined> };

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

export const mcpSetupCommand = async (io: Io, args: Args, out: Output) => {
  const scope = scopeOf(typeof args.values.scope === "string" ? args.values.scope : undefined);
  const remove = args.values.remove === true;
  const command = (typeof args.values.command === "string" ? args.values.command : "rmk-mcp")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (command.length === 0) throw usage("--command needs the command that starts rmk-mcp.");
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

  // Only mcp-setup's own entries are planned: every item's stay as they are.
  const { root, state: statePath } = places(io, scope);
  const all = readState(statePath);
  const own = {
    version: 1 as const,
    entries: all.entries.filter((e) => e.item === MCP_SETUP_ITEM),
  };
  const others = all.entries.filter((e) => e.item !== MCP_SETUP_ITEM);
  const plan = await planChanges(root, own, wanted, { force: args.values.force === true });
  out.set("conflicts", plan.conflicts);
  if (plan.conflicts.length) {
    for (const c of plan.conflicts)
      out.say(
        `  ${c.path}${c.key ? ` (${Array.isArray(c.key) ? c.key.join(".") : c.key})` : ""}: ${c.reason === "unmanaged" ? "not written by rmk" : "edited since rmk wrote it"}`,
      );
    throw new RmkError(
      "Nothing was written: an MCP server entry there isn't rmk's. Move it aside, or run again with --force.",
      3,
      "conflicts",
      { conflicts: plan.conflicts },
    );
  }
  const next = applyPlan(root, own, plan);
  next.entries.push(...others);
  mkdirSync(join(statePath, ".."), { recursive: true });
  writeState(statePath, next);

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
    for (const note of toolNotes(written, scope, root)) out.say(`Note: ${note}`);
    if (written.length)
      out.say(
        "Restart the AI tool, or reload its MCP servers, to start it. It uses the token from rmk login.",
      );
  }
};
