import type { TopicSlug } from "@/components/help/topics";

/**
 * Where each type goes in each AI tool, as the Documentation says it (features 023–025, each
 * checked against the tool's docs when its renderer was built): the tool pages list them in full,
 * and the types list shows the first part.
 */

/** Where each type goes in Claude Code (renderer 023, checked against its docs on 2026-09-28). */
export const CLAUDE_CODE_PATHS: [string, string][] = [
  ["skill", ".claude/skills/<name>/"],
  ["agent", ".claude/agents/<name>.md"],
  ["rule", ".claude/rules/<name>.md, or a skill when the AI decides or you ask"],
  ["command", ".claude/skills/<name>/, run as /<name>"],
  ["hook", "hooks in .claude/settings.json; a script under .claude/hooks/<name>/"],
  ["mcp-server", "mcpServers in .mcp.json (your home folder: ~/.claude.json)"],
  ["permission-policy", "permissions in .claude/settings.json"],
  ["output-style", ".claude/output-styles/<name>.md"],
  [
    "statusline",
    "statusLine in .claude/settings.json; the script under .claude/statusline/<name>/",
  ],
  ["lsp-server", "a local plugin under .claude/rmk-plugins/<name>/"],
  ["bundle", "nothing of its own: its items are installed one by one"],
];

/** Where each type goes in Codex (renderer 024, checked against its docs on 2026-09-28). */
export const CODEX_PATHS: [string, string][] = [
  ["skill", ".agents/skills/<name>/ (your home folder: ~/.agents/skills/)"],
  ["agent", ".codex/agents/<name>.toml"],
  [
    "rule",
    "a section in AGENTS.md (your home folder: ~/.codex/AGENTS.md), or a skill when the AI decides or you ask",
  ],
  ["command", ".agents/skills/<name>/, run as /<name>"],
  ["hook", "hooks in .codex/hooks.json; a script under .codex/hooks/<name>/"],
  ["mcp-server", "mcp_servers in .codex/config.toml"],
  ["permission-policy", ".codex/rules/<name>.rules, for shell commands only"],
  ["output-style", "not supported: skipped with a warning"],
  ["statusline", "not supported: skipped with a warning"],
  ["lsp-server", "not supported: skipped with a warning"],
  ["bundle", "nothing of its own: its items are installed one by one"],
];

/** Where each type goes in Cursor (renderer 025, checked against its docs on 2026-09-29). */
export const CURSOR_PATHS: [string, string][] = [
  ["skill", ".agents/skills/<name>/ (your home folder: ~/.agents/skills/)"],
  ["agent", ".cursor/agents/<name>.md"],
  ["rule", ".cursor/rules/<name>.mdc (projects only: Cursor keeps your own rules in its settings)"],
  ["command", ".agents/skills/<name>/, run as /<name>"],
  ["hook", "hooks in .cursor/hooks.json; a script under .cursor/hooks/<name>/"],
  ["mcp-server", "mcpServers in .cursor/mcp.json"],
  [
    "permission-policy",
    "permissions in .cursor/cli.json (home: ~/.cursor/cli-config.json), for the CLI",
  ],
  ["output-style", "not supported: skipped with a warning"],
  ["statusline", "not supported: skipped with a warning"],
  ["lsp-server", "not supported: skipped with a warning"],
  ["bundle", "nothing of its own: its items are installed one by one"],
];

/** Each tool's list, by renderer id. */
export const TOOL_PATHS: Record<string, [string, string][]> = {
  "claude-code": CLAUDE_CODE_PATHS,
  codex: CODEX_PATHS,
  cursor: CURSOR_PATHS,
};

/** The place itself, without the notes after it: up to the first comma, parenthesis or semicolon. */
export const shortPlace = (where: string): string => where.split(/[,(;]/)[0]?.trim() ?? where;

/** Each tool's page in the Documentation, by renderer id. */
export const TOOL_PAGES: Record<string, TopicSlug> = {
  "claude-code": "claude-code",
  codex: "codex",
  cursor: "cursor",
};

/**
 * Where a type goes in a tool, in short: "installs its items" for a bundle, "" if unknown. With an
 * item's name, `<name>` becomes it, as the renderers name the files.
 */
export const placeFor = (toolId: string, type: string, name?: string): string => {
  if (type === "bundle") return "installs its items";
  const where = TOOL_PATHS[toolId]?.find(([t]) => t === type)?.[1];
  const place = where ? shortPlace(where) : "";
  return name ? place.replaceAll("<name>", name) : place;
};
