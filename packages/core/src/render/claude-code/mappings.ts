import type { ToolTable } from "../helpers.js";

/** Claude Code's names for the canonical ones (manifest spec §5, MVP §3.1), checked 2026-09-28. */
export const TOOLS: ToolTable = {
  names: {
    read: "Read",
    edit: "Edit",
    write: "Write",
    glob: "Glob",
    grep: "Grep",
    shell: "Bash",
    "web-fetch": "WebFetch",
    "web-search": "WebSearch",
  },
  mcp: (server, tool) => (tool ? `mcp__${server}__${tool}` : `mcp__${server}`),
};

export const EVENTS: Partial<Record<string, string>> = {
  "session.start": "SessionStart",
  "session.end": "SessionEnd",
  "prompt.submit": "UserPromptSubmit",
  "tool.before": "PreToolUse",
  "tool.after": "PostToolUse",
  "permission.request": "PermissionRequest",
  "subagent.start": "SubagentStart",
  "subagent.stop": "SubagentStop",
  "compact.before": "PreCompact",
  "agent.stop": "Stop",
};

/** `default` is left out, so Claude Code's own default applies. */
export const MODELS: Partial<Record<string, string>> = { fast: "haiku", strong: "opus" };
