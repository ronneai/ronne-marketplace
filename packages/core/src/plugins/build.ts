import type { PackageFile } from "../package-file.js";
import { rendererById } from "../render/registry.js";
import { installsIn, supportOf } from "../render/support.js";
import type { RenderInput } from "../render/types.js";
import { bytesOf, jsonFile, type Part, type PluginAdapter } from "./adapter.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { PLUGIN_NAME_PROBLEM_MESSAGES, pluginName, pluginNameProblem } from "./names.js";
import type { BuiltPlugin, PluginInput, PluginTool, PluginWarning } from "./types.js";

export class PluginError extends Error {
  constructor(
    readonly code: "unsupported_type" | "plugin_conflict",
    message: string,
  ) {
    super(message);
    this.name = "PluginError";
  }
}

const ADAPTERS: Record<PluginTool, PluginAdapter> = {
  "claude-code": claudeCodeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
};

const byPath = (a: PackageFile, b: PackageFile) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** What a member's parts add up to, across members; a second writer of the same thing conflicts. */
type Collected = {
  files: Map<string, PackageFile>;
  hooks: Record<string, unknown[]>;
  mcp: Record<string, unknown>;
  lsp: Record<string, unknown>;
};

const conflict = (what: string, member: RenderInput) =>
  new PluginError(
    "plugin_conflict",
    `${member.name} writes ${what}, which another member also writes.`,
  );

const collect = (into: Collected, part: Part, member: RenderInput) => {
  switch (part.kind) {
    case "file":
      if (into.files.has(part.path)) throw conflict(part.path, member);
      into.files.set(part.path, {
        path: part.path,
        bytes: bytesOf(part.content),
        ...(part.executable ? { executable: true } : {}),
      });
      return;
    case "hook":
      into.hooks[part.event] = [...(into.hooks[part.event] ?? []), part.entry];
      return;
    case "mcp":
      if (part.name in into.mcp) throw conflict(`the MCP server ${part.name}`, member);
      into.mcp[part.name] = part.server;
      return;
    case "lsp":
      for (const [name, server] of Object.entries(part.servers)) {
        if (name in into.lsp) throw conflict(`the language server ${name}`, member);
        into.lsp[name] = server;
      }
  }
};

/**
 * An item, with its dependencies or a bundle's members, as a plugin for one tool (076, contract
 * `docs/spec/plugin-feeds.md`). Each member is rendered by the tool's renderer at project scope,
 * and the adapter moves what it wrote into the plugin's layout; anything without a place in a
 * plugin is left out with a `not_in_plugin` warning. Throws `PluginError` when the item's own type
 * doesn't install in the tool, or when two members write the same thing.
 */
export const buildPlugin = (tool: PluginTool, input: PluginInput): BuiltPlugin => {
  const renderer = rendererById(tool);
  const adapter = ADAPTERS[tool];
  if (!renderer || !adapter) throw new Error(`There's no plugin builder for ${tool}.`);
  const { item } = input;
  const type = String(item.manifest.type);
  if (!installsIn(supportOf(item.manifest, type)[tool]))
    throw new PluginError(
      "unsupported_type",
      `${item.name} (${type}) doesn't install in ${adapter.toolName}.`,
    );
  const name = pluginName(item.name);
  const problem = pluginNameProblem(tool, name);
  if (problem)
    return {
      name,
      files: [],
      warnings: [
        {
          code: "name_refused",
          message: `The plugin name ${name} ${PLUGIN_NAME_PROBLEM_MESSAGES[problem]}, so ${item.name} isn't offered as a ${adapter.toolName} plugin.`,
        },
      ],
      empty: true,
    };

  const warnings: PluginWarning[] = [];
  const warn = (warning: PluginWarning) => {
    if (!warnings.some((w) => w.code === warning.code && w.message === warning.message))
      warnings.push(warning);
  };
  const into: Collected = { files: new Map(), hooks: {}, mcp: {}, lsp: {} };
  const bundle = type === "bundle";
  /** Whether the item itself, or for a bundle any member, put something in the plugin. */
  let filled = false;
  for (const member of input.members) {
    const result = renderer.render(member, { scope: "project", targets: [tool] });
    const leftOut: string[] = [];
    let placed = 0;
    for (const change of result.changes) {
      const placement = adapter.place(change);
      if ("leftOut" in placement) leftOut.push(placement.leftOut);
      else {
        for (const part of placement) collect(into, part, member);
        placed += placement.length;
      }
    }
    if (placed && (bundle || member === item)) filled = true;
    // A renderer's warnings only matter for what made it into the plugin.
    if (placed || !leftOut.length) for (const warning of result.warnings) warn(warning);
    for (const reason of leftOut)
      warn({
        code: "not_in_plugin",
        message: `${reason}, so that part of ${member.name} was left out.`,
      });
  }
  const empty = !filled;
  const generated: PackageFile[] = [adapter.manifest(item, name)];
  if (Object.keys(into.hooks).length) generated.push(adapter.hooksFile(into.hooks));
  if (Object.keys(into.mcp).length) generated.push(adapter.mcpFile(into.mcp));
  if (Object.keys(into.lsp).length) generated.push(jsonFile(".lsp.json", into.lsp));
  for (const file of generated) {
    if (into.files.has(file.path)) throw conflict(file.path, item);
    into.files.set(file.path, file);
  }
  return { name, files: [...into.files.values()].sort(byPath), warnings, empty };
};
