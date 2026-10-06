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
 * Which types each type may depend on (manifest spec §3): since 096, any type on any type, so
 * people compose what works for them. Cycles and an item on itself are still refused, by the
 * package checks and the registry. Kept as a table so callers ask one place.
 */
export const DEPENDENCY_TYPES: Record<ItemType, readonly ItemType[]> = {
  skill: ITEM_TYPES,
  agent: ITEM_TYPES,
  rule: ITEM_TYPES,
  command: ITEM_TYPES,
  hook: ITEM_TYPES,
  "mcp-server": ITEM_TYPES,
  "permission-policy": ITEM_TYPES,
  "output-style": ITEM_TYPES,
  statusline: ITEM_TYPES,
  "lsp-server": ITEM_TYPES,
  bundle: ITEM_TYPES,
};

export const mayHaveDependencies = (type: ItemType): boolean => DEPENDENCY_TYPES[type].length > 0;

export const mayDependOn = (type: ItemType, dependency: ItemType): boolean =>
  DEPENDENCY_TYPES[type].includes(dependency);
