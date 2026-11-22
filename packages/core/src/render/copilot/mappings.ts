import type { ToolTable } from "../helpers.js";

/**
 * Copilot's names for the canonical ones (manifest spec §5, MVP §3.1), checked 2026-11-22 against
 * docs.github.com's custom agents configuration. An agent's `tools` take Copilot's aliases, which
 * the CLI, VS Code and the cloud agent all read; several canonical tools share one alias.
 */
export const AGENT_TOOLS: ToolTable = {
  names: {
    read: "read",
    edit: "edit",
    write: "edit",
    grep: "search",
    glob: "search",
    shell: "execute",
    "web-fetch": "web",
    "web-search": "web",
  },
  mcp: (server, tool) => `${server}/${tool ?? "*"}`,
};

/** Every canonical event has a Copilot one (hooks configuration, checked 2026-11-22). */
export const EVENTS: Partial<Record<string, string>> = {
  "session.start": "sessionStart",
  "session.end": "sessionEnd",
  "prompt.submit": "userPromptSubmitted",
  "tool.before": "preToolUse",
  "tool.after": "postToolUse",
  "permission.request": "permissionRequest",
  "subagent.start": "subagentStart",
  "subagent.stop": "subagentStop",
  "compact.before": "preCompact",
  "agent.stop": "agentStop",
};

/** The events whose `matcher` Copilot tests against `toolName`. */
export const TOOL_EVENTS = new Set(["preToolUse", "postToolUse", "permissionRequest"]);

/**
 * The CLI's own tool names, which a hook's `matcher` is matched against (compiled as `^(?:…)$`).
 * MCP tools and web search have no documented name there, so they have no matcher.
 */
export const HOOK_TOOLS: Partial<Record<string, string>> = {
  read: "view",
  edit: "edit",
  write: "create",
  grep: "grep",
  glob: "glob",
  shell: "bash",
  "web-fetch": "web_fetch",
};
