/**
 * Cursor's names for the canonical ones (manifest spec §5, MVP §3.1), checked 2026-09-28. Hook
 * matchers use Cursor's tool types; `edit` and `write` are both `Write`.
 */
export const TOOLS: Partial<Record<string, string>> = {
  read: "Read",
  edit: "Write",
  write: "Write",
  grep: "Grep",
  shell: "Shell",
};

/** `permission.request` has no Cursor event. */
export const EVENTS: Partial<Record<string, string>> = {
  "session.start": "sessionStart",
  "session.end": "sessionEnd",
  "prompt.submit": "beforeSubmitPrompt",
  "tool.before": "preToolUse",
  "tool.after": "postToolUse",
  "subagent.start": "subagentStart",
  "subagent.stop": "subagentStop",
  "compact.before": "preCompact",
  "agent.stop": "stop",
};

/** A hook matcher for a canonical tool: Cursor matches MCP tools by the tool's own name. */
export const matcherFor = (tool: string): string | null => {
  const mcp = /^mcp:[^/]+\/(.+)$/.exec(tool);
  if (mcp) return `MCP:${mcp[1]}`;
  return TOOLS[tool] ?? null;
};
