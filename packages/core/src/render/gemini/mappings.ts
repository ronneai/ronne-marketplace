/**
 * Gemini CLI's names for the canonical tools (manifest spec §5, MVP §3.1), checked 2026-11-22
 * against geminicli.com/docs (reference/tools) and the CLI 0.70.0's source (its `*_TOOL_NAME`
 * constants). An agent's `tools` and a hook's `matcher` take the same names.
 */
export const TOOLS: Partial<Record<string, string>> = {
  read: "read_file",
  edit: "replace",
  write: "write_file",
  grep: "grep_search",
  glob: "glob",
  shell: "run_shell_command",
  "web-fetch": "web_fetch",
  "web-search": "google_web_search",
};

/**
 * Gemini CLI's name for a canonical tool, or null. An MCP tool is `mcp_<server>_<tool>`, and a whole
 * server `mcp_<server>_*`. The CLI 0.70.0 splits the name at the first `_` after `mcp_`, and an
 * agent with a name it can't parse doesn't load, so a server or tool name outside its slug pattern
 * (or a server with `_`) gives null.
 */
export const toolOf = (canonical: string): string | null => {
  const mcp = /^mcp:([^/]+)(?:\/(.+))?$/.exec(canonical);
  if (mcp) {
    const server = mcp[1] ?? "";
    const tool = mcp[2] ?? "*";
    if (!/^[a-z0-9.:-]+$/i.test(server)) return null;
    if (tool !== "*" && (!/^[a-z0-9_.:-]+$/i.test(tool) || /^_*$/.test(tool))) return null;
    return `mcp_${server}_${tool}`;
  }
  return Object.hasOwn(TOOLS, canonical) ? (TOOLS[canonical] ?? null) : null;
};
