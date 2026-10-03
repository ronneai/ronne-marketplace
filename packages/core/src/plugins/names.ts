import { parseItemName } from "../names.js";
import type { PluginTool } from "./types.js";

/**
 * Plugin names (contract, Names): `@scope/name` is `scope.name`. Item and scope names never contain
 * a dot, so the one dot is the separator and the name can be read back.
 */
export const pluginName = (itemName: string): string => {
  const parts = parseItemName(itemName);
  if (!parts) throw new Error(`${itemName} isn't a full item name (@scope/name).`);
  return `${parts.scope}.${parts.name}`;
};

/** `scope.name` → `@scope/name`, or null when it isn't a plugin name Ronne makes. */
export const itemNameOfPlugin = (plugin: string): string | null => {
  const [scope, name, ...rest] = plugin.split(".");
  if (scope === undefined || name === undefined || rest.length) return null;
  const itemName = `@${scope}/${name}`;
  return parseItemName(itemName) ? itemName : null;
};

export type PluginNameProblem = "too_long" | "double_hyphen" | "reserved";

/** Prefixes Claude Code refuses in a plugin's name (checked 2026-10-03). */
const CLAUDE_RESERVED = ["claude-", "anthropic-", "anthropics-", "cc-plugin-"];

/**
 * Why a tool refuses a plugin name, or null when it takes it (checked 2026-10-03). Agent Plugins,
 * which Codex reads, allows at most 64 characters and no `--`; Claude Code reserves a few prefixes
 * and Claude Desktop stops at 128 characters; every name Ronne makes fits Cursor's pattern.
 */
export const pluginNameProblem = (tool: PluginTool, name: string): PluginNameProblem | null => {
  switch (tool) {
    case "codex":
      if (name.length > 64) return "too_long";
      return name.includes("--") ? "double_hyphen" : null;
    case "claude-code":
      if (name.length > 128) return "too_long";
      return CLAUDE_RESERVED.some((prefix) => name.startsWith(prefix)) ? "reserved" : null;
    case "cursor":
      return null;
  }
};

export const PLUGIN_NAME_PROBLEM_MESSAGES: Record<PluginNameProblem, string> = {
  too_long: "is longer than the tool allows",
  double_hyphen: "contains `--`, which the tool doesn't allow",
  reserved: "starts with a prefix the tool reserves",
};
