/**
 * Antigravity's names for the canonical tools (manifest spec §5, MVP §3.1), checked 2026-11-22
 * against antigravity.google/docs (subagents, hooks' "Supported tools"), which the app reads. The
 * CLI 1.5.14 takes them in an agent's `tools` as aliases of its own (`view_file` → `read_file`,
 * `replace_file_content` → `edit_file`, `write_to_file` → `write_file`) and drops the ones it
 * doesn't have (`grep_search`, `find_by_name`, `read_url_content`) without hanging (2026-11-22).
 * MCP tools have none an agent can list (lazily loaded ones all run as `call_mcp_tool`), so they warn.
 */
export const TOOLS: Partial<Record<string, string>> = {
  read: "view_file",
  edit: "replace_file_content",
  write: "write_to_file",
  grep: "grep_search",
  glob: "find_by_name",
  shell: "run_command",
  "web-fetch": "read_url_content",
  "web-search": "search_web",
};

/** A canonical tool's Antigravity name, or null (an MCP tool, or one with no equivalent). */
export const toolOf = (canonical: string): string | null =>
  Object.hasOwn(TOOLS, canonical) ? (TOOLS[canonical] ?? null) : null;

/** The model hints (manifest spec §6) as Antigravity's agent `model` values. */
export const MODELS: Partial<Record<string, string>> = {
  fast: "flash",
  strong: "pro",
  default: "inherit",
};

/** The canonical events Antigravity has (hooks, 2026-11-22); the rest have none. */
export const EVENTS: Partial<Record<string, string>> = {
  "session.start": "SessionStart",
  "tool.before": "PreToolUse",
  "tool.after": "PostToolUse",
  "agent.stop": "Stop",
};

/** The events whose handlers sit under a `matcher`; the others take bare handlers. */
export const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse"]);

/**
 * Every name a hook may see for a canonical tool: the CLI's own (seen on the CLI 1.5.14,
 * 2026-11-22: `read_file`, `edit_file`, `write_file`, `run_command`, `search_web`) and the app's,
 * from the docs. The CLI has no grep, glob or fetch tool, so those match the app only.
 */
const HOOK_NAMES: Partial<Record<string, string[]>> = {
  read: ["read_file", "view_file"],
  edit: ["edit_file", "replace_file_content", "multi_replace_file_content"],
  write: ["write_file", "write_to_file"],
  grep: ["grep_search"],
  glob: ["find_by_name"],
  shell: ["run_command"],
  "web-fetch": ["read_url_content"],
  "web-search": ["search_web"],
};

/**
 * A hook `matcher` for a canonical tool, or null: Antigravity matches the whole tool name against it
 * as a regular expression (on the CLI 1.5.14, `read` didn't match `read_file`). MCP tools have none:
 * lazily loaded ones all run as `call_mcp_tool`.
 */
export const hookMatcher = (tool: string): string | null => {
  const names = Object.hasOwn(HOOK_NAMES, tool) ? HOOK_NAMES[tool] : undefined;
  return names ? `^(?:${names.join("|")})$` : null;
};

/** A permission rule's action for a canonical tool (permissions, 2026-11-22), or null. */
export const PERMISSION_ACTIONS: Partial<Record<string, string>> = {
  shell: "command",
  read: "read_file",
  edit: "write_file",
  write: "write_file",
  "web-fetch": "read_url",
};
