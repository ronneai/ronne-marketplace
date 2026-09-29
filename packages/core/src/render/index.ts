// `@ronneai/core/render`: the renderer interface and what renderers share (feature 021).

export { claudeCodeRenderer } from "./claude-code/renderer.js";
export { codexRenderer } from "./codex/renderer.js";
export { cursorRenderer } from "./cursor/renderer.js";
export {
  type CommentSyntax,
  canonicalJson,
  changePaths,
  disabledWarning,
  type EnvSyntax,
  envRef,
  managedMarker,
  pathProblem,
  section,
  sectionBegin,
  sectionEnd,
  stateHash,
  type ToolTable,
  targetsFor,
  toolName,
  trimTrailingNewlines,
} from "./helpers.js";
export { RENDERERS, rendererById } from "./registry.js";
export type {
  Change,
  ChangeFile,
  ChangeKind,
  PlatformRenderer,
  ProjectProbe,
  RenderContext,
  RenderInput,
  RenderResult,
  RenderScope,
  RenderWarning,
  RenderWarningCode,
  SupportLevel,
} from "./types.js";
