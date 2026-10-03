import type { PackageFile } from "../package-file.js";
import type { Change, RenderInput } from "../render/types.js";
import type { PluginTool } from "./types.js";

/**
 * How a tool's adapter places a renderer's changes in a plugin (076): the renderer's own output,
 * moved from the project's folders and settings files into the plugin's layout (contract, Plugin
 * contents per type), so the mappings stay in one place.
 */

/** One piece of a plugin, from one change. */
export type Part =
  | { kind: "file"; path: string; content: Uint8Array | string; executable?: boolean }
  /** One entry of `hooks.<event>` in the plugin's `hooks/hooks.json`. */
  | { kind: "hook"; event: string; entry: unknown }
  /** One server in the plugin's MCP file. */
  | { kind: "mcp"; name: string; server: unknown }
  /** Language servers for the plugin's `.lsp.json`, by name. */
  | { kind: "lsp"; servers: Record<string, unknown> };

/**
 * The parts a change becomes; none for plumbing a plugin doesn't need (such as the settings keys
 * that register rmk's local lsp plugin); or why it has no place in a plugin, for the warning.
 */
export type Placement = Part[] | { leftOut: string };

export type PluginAdapter = {
  tool: PluginTool;
  /** "Claude Code", for warnings. */
  toolName: string;
  place(change: Change): Placement;
  manifest(item: RenderInput, name: string): PackageFile;
  hooksFile(hooks: Record<string, unknown[]>): PackageFile;
  mcpFile(servers: Record<string, unknown>): PackageFile;
};

const encoder = new TextEncoder();

export const bytesOf = (content: Uint8Array | string): Uint8Array =>
  typeof content === "string" ? encoder.encode(content) : content;

/** A JSON file as plugins write it: two-space indents and a final newline. */
export const jsonFile = (path: string, value: unknown): PackageFile => ({
  path,
  bytes: encoder.encode(`${JSON.stringify(value, null, 2)}\n`),
});

/**
 * A `file` or `dir` change under one of `table`'s project folders, as files under the plugin
 * folder it maps to; null when it's under none of them.
 */
export const moved = (change: Change, table: readonly [string, string][]): Part[] | null => {
  if (change.kind !== "file" && change.kind !== "dir") return null;
  const match = table.find(([from]) => change.path.startsWith(from));
  if (!match) return null;
  const [from, to] = match;
  const path = `${to}${change.path.slice(from.length)}`;
  if (change.kind === "file")
    return [{ kind: "file", path, content: change.content, executable: change.executable }];
  return change.files.map((file) => ({
    kind: "file",
    path: `${path}/${file.path}`,
    content: file.content,
    executable: file.executable,
  }));
};

/** A hook entry with each handler's `command` rewritten, such as a script's path. */
export const withCommands = (entry: unknown, rewrite: (command: string) => string): unknown => {
  if (!entry || typeof entry !== "object") return entry;
  const value = entry as Record<string, unknown>;
  if (typeof value.command === "string") return { ...value, command: rewrite(value.command) };
  if (Array.isArray(value.hooks))
    return { ...value, hooks: value.hooks.map((hook) => withCommands(hook, rewrite)) };
  return value;
};

/** `command` with `prefix` at its start replaced, or as it was. */
export const replacePrefix = (command: string, prefix: string, replacement: string): string =>
  command.startsWith(prefix) ? `${replacement}${command.slice(prefix.length)}` : command;
