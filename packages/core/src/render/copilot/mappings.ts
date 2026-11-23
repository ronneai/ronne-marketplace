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
 * An MCP tool is `<server>-<tool>` there (seen on the CLI 1.0.114, 2026-11-22: `probe-ping`
 * matched only that tool); web search has no name seen yet, so it has no matcher.
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

/**
 * A hook `matcher` for a canonical tool, or null. Server and tool names hold only letters, digits,
 * `-` and `_` (the manifest schema), so they need no escaping in the pattern.
 */
export const hookMatcher = (tool: string): string | null => {
  if (tool.startsWith("mcp:")) {
    const [server = "", ...rest] = tool.slice("mcp:".length).split("/");
    if (!/^[a-z0-9-]+$/.test(server)) return null;
    const name = rest.join("/");
    if (!name) return `${server}-.*`;
    return /^[A-Za-z0-9_-]+$/.test(name) ? `${server}-${name}` : null;
  }
  return Object.hasOwn(HOOK_TOOLS, tool) ? (HOOK_TOOLS[tool] ?? null) : null;
};
