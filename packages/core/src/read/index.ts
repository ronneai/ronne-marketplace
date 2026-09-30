// `@ronneai/core/read`: the readers, which turn an AI tool's own files into an item (feature 038).

export { readSkill, skillName } from "./skill.js";
export { DESCRIPTION_MAX_LENGTH, fitDescription, toItemName } from "./text.js";
export {
  type ItemReference,
  ReadError,
  type ReadErrorCode,
  type ReadResult,
  type ReadWarning,
  type ReadWarningCode,
} from "./types.js";
