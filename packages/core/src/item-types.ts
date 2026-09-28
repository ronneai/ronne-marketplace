/** Every item type a manifest can declare. See docs/spec/manifest.md §2. */
export const ITEM_TYPES = [
  "skill",
  "agent",
  "rule",
  "command",
  "hook",
  "mcp-server",
  "permission-policy",
  "output-style",
  "statusline",
  "lsp-server",
  "bundle",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const isItemType = (value: string): value is ItemType => {
  return (ITEM_TYPES as readonly string[]).includes(value);
};

/**
 * Which types each type may depend on (manifest spec §3). A bundle may depend on anything; an
 * agent on the skills, MCP servers, hooks, rules and commands it uses; a skill or command on MCP
 * servers; every other type on nothing.
 */
export const DEPENDENCY_TYPES: Record<ItemType, readonly ItemType[]> = {
  bundle: ITEM_TYPES,
  agent: ["skill", "mcp-server", "hook", "rule", "command"],
  skill: ["mcp-server"],
  command: ["mcp-server"],
  rule: [],
  hook: [],
  "mcp-server": [],
  "permission-policy": [],
  "output-style": [],
  statusline: [],
  "lsp-server": [],
};

export const mayHaveDependencies = (type: ItemType): boolean => DEPENDENCY_TYPES[type].length > 0;

export const mayDependOn = (type: ItemType, dependency: ItemType): boolean =>
  DEPENDENCY_TYPES[type].includes(dependency);
