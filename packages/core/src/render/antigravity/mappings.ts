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
