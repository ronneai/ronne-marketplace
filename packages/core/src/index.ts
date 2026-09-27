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

export function isItemType(value: string): value is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(value);
}
