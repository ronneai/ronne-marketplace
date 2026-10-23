import type { TopicSlug } from "@/components/help/topics";

/**
 * Where a type goes in a tool, in short (features 023–025, each checked against the tool's docs
 * when its renderer was built; the Documentation's tool pages have the full story). Only the place
 * itself, as data: a path, or a key in a file, a section of a file or a local plugin; the words
 * around it are messages (`item.tools.place`, 131). `<name>` stands for the item's name.
 */
export type ToolPlace =
  | { kind: "path"; path: string }
  | { kind: "key"; key: string; path: string }
  | { kind: "section"; path: string }
  | { kind: "plugin"; path: string };

const path = (p: string): ToolPlace => ({ kind: "path", path: p });
const key = (k: string, p: string): ToolPlace => ({ kind: "key", key: k, path: p });

/** Claude Code (renderer 023, checked against its docs on 2026-09-28). */
const CLAUDE_CODE: Record<string, ToolPlace> = {
  skill: path(".claude/skills/<name>/"),
  agent: path(".claude/agents/<name>.md"),
  rule: path(".claude/rules/<name>.md"),
  command: path(".claude/skills/<name>/"),
  hook: key("hooks", ".claude/settings.json"),
  "mcp-server": key("mcpServers", ".mcp.json"),
  "permission-policy": key("permissions", ".claude/settings.json"),
  "output-style": path(".claude/output-styles/<name>.md"),
  statusline: key("statusLine", ".claude/settings.json"),
  "lsp-server": { kind: "plugin", path: ".claude/rmk-plugins/<name>/" },
};

/** Codex (renderer 024, checked against its docs on 2026-09-28). Output styles, status lines and
 * language servers aren't supported there. */
const CODEX: Record<string, ToolPlace> = {
  skill: path(".agents/skills/<name>/"),
  agent: path(".codex/agents/<name>.toml"),
  rule: { kind: "section", path: "AGENTS.md" },
  command: path(".agents/skills/<name>/"),
  hook: key("hooks", ".codex/hooks.json"),
  "mcp-server": key("mcp_servers", ".codex/config.toml"),
  "permission-policy": path(".codex/rules/<name>.rules"),
};

/** Cursor (renderer 025, checked against its docs on 2026-09-29). As Codex, no output styles,
 * status lines or language servers. */
const CURSOR: Record<string, ToolPlace> = {
  skill: path(".agents/skills/<name>/"),
  agent: path(".cursor/agents/<name>.md"),
  rule: path(".cursor/rules/<name>.mdc"),
  command: path(".agents/skills/<name>/"),
  hook: key("hooks", ".cursor/hooks.json"),
  "mcp-server": key("mcpServers", ".cursor/mcp.json"),
  "permission-policy": key("permissions", ".cursor/cli.json"),
};

/** Each tool's places, by renderer id. */
export const TOOL_PLACES: Record<string, Record<string, ToolPlace>> = {
  "claude-code": CLAUDE_CODE,
  codex: CODEX,
  cursor: CURSOR,
};

/** Each tool's page in the Documentation, by renderer id. */
export const TOOL_PAGES: Record<string, TopicSlug> = {
  "claude-code": "claude-code",
  codex: "codex",
  cursor: "cursor",
};

/**
 * Where a type goes in a tool, or null: a bundle has no place of its own (its items are installed
 * one by one), and a type a tool doesn't support has none there. With an item's name, `<name>`
 * becomes it, as the renderers name the files.
 */
export const placeFor = (toolId: string, type: string, name?: string): ToolPlace | null => {
  const place = TOOL_PLACES[toolId]?.[type];
  if (!place || !name) return place ?? null;
  return { ...place, path: place.path.replaceAll("<name>", name) };
};
