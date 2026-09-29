/**
 * Codex's names for the canonical ones (manifest spec §5, MVP §3.1), checked 2026-09-28. Codex's
 * hook events are Claude Code's; its tool names aren't documented, so no tool table (spec 024).
 */
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

/** Permission decisions as Codex's `prefix_rule` says them. */
export const DECISIONS: Partial<Record<string, string>> = {
  allow: "allow",
  ask: "prompt",
  deny: "forbidden",
};
