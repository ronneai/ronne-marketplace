// `@ronneai/core/read`: the readers, which turn an AI tool's own files into an item (feature 038).

export { agentName, readAgent } from "./claude-code/agent.js";
export { commandName, readCommand } from "./claude-code/command.js";
export { mcpServerName, readMcpServer } from "./claude-code/mcp-server.js";
export { readRule, ruleName } from "./claude-code/rule.js";
export { codexAgentName, readCodexAgent } from "./codex/agent.js";
export { readCodexMcpServer } from "./codex/mcp-server.js";
export { cursorAgentName, readCursorAgent } from "./cursor/agent.js";
export {
  CURSOR_COMMAND_EXTENSIONS,
  cursorCommandName,
  readCursorCommand,
} from "./cursor/command.js";
export { readCursorMcpServer } from "./cursor/mcp-server.js";
export { readCursorRule } from "./cursor/rule.js";
export { withDependencies, withoutVersion } from "./dependencies.js";
export { type FieldChange, type MergeResult, mergeChange } from "./merge.js";
export { readSkill, skillName } from "./skill.js";
export { DESCRIPTION_MAX_LENGTH, fitDescription, toItemName } from "./text.js";
export {
  type DescriptionSource,
  type ItemReference,
  ReadError,
  type ReadErrorCode,
  type ReadResult,
  type ReadWarning,
  type ReadWarningCode,
} from "./types.js";
