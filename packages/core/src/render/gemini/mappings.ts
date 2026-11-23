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
    // The CLI 0.70.0 cuts an MCP tool's name over 63 characters to its first and last 30
    // (`generateValidName`), so a longer name, or a server whose prefix runs past the first 30, no
    // longer matches what it calls.
    if (tool === "*" ? `mcp_${server}_`.length > 30 : `mcp_${server}_${tool}`.length > 63)
      return null;
    return `mcp_${server}_${tool}`;
  }
  return Object.hasOwn(TOOLS, canonical) ? (TOOLS[canonical] ?? null) : null;
};

/** Tools Gemini CLI has besides the main one for a canonical tool: reading many files is reading. */
const ALSO: Partial<Record<string, string[]>> = { read: ["read_many_files"] };

/** Every Gemini CLI name for a canonical tool, the main one first, or null. */
export const namesOf = (canonical: string): string[] | null => {
  const name = toolOf(canonical);
  if (!name) return null;
  return [name, ...((Object.hasOwn(ALSO, canonical) ? ALSO[canonical] : undefined) ?? [])];
};

/** The canonical events Gemini CLI has (hooks reference and the CLI 0.70.0's `HookEventName`). */
export const EVENTS: Partial<Record<string, string>> = {
  "session.start": "SessionStart",
  "session.end": "SessionEnd",
  "prompt.submit": "BeforeAgent",
  "tool.before": "BeforeTool",
  "tool.after": "AfterTool",
  "agent.stop": "AfterAgent",
  "compact.before": "PreCompress",
};

/** The events whose `matcher` Gemini CLI tests against the tool's name. */
export const TOOL_EVENTS = new Set(["BeforeTool", "AfterTool"]);

/**
 * A hook `matcher` for a canonical tool, or null. Gemini CLI tests it as an unanchored regular
 * expression (`new RegExp(matcher).test(toolName)`, the CLI 0.70.0), so it's anchored here; a
 * whole MCP server is every `mcp_<server>_` tool.
 */
export const hookMatcher = (tool: string): string | null => {
  const names = namesOf(tool);
  if (!names) return null;
  const pattern = names
    .map((name) =>
      name.endsWith("_*")
        ? `${name.slice(0, -1).replaceAll(".", "\\.")}.*`
        : name.replaceAll(".", "\\."),
    )
    .join("|");
  return `^(?:${pattern})$`;
};

/** The manifest's decisions as a policy rule's (`PolicyDecision`, the CLI 0.70.0). */
export const DECISIONS: Partial<Record<string, string>> = {
  allow: "allow",
  ask: "ask_user",
  deny: "deny",
};

/**
 * A rule's priority, which the CLI 0.70.0 requires (0–999, higher wins within a tier): deny over
 * ask over allow, as the other tools rank them, and as low as that allows, so a rule the person
 * wrote in their own policies (priority 4 or more) wins over rmk's.
 */
export const PRIORITIES: Partial<Record<string, number>> = { deny: 3, ask: 2, allow: 1 };

/**
 * The approval modes an `allow` or `ask` rule applies in: every one but plan mode, whose own
 * read-only rules sit in a lower tier and would lose to them (the CLI 0.70.0's `ApprovalMode`).
 */
export const LOOSER_MODES = ["default", "autoEdit", "yolo"];
