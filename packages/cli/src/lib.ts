/**
 * `@ronneai/rmk/lib` (feature 027): rmk's install pipeline and registry access as functions, with no
 * terminal in them, for the registry MCP server. The `rmk` commands are built on the same code, so
 * the two can't drift.
 */
export { type ApiClient, ApiError, apiClient, rmkVersion } from "./api.js";
export { diskHash, type Plan, type State } from "./apply.js";
export { configDir, readUserConfig } from "./config.js";
export { connectRegistry } from "./connect.js";
export { RmkError } from "./errors.js";
export {
  describeLocalItems,
  discoverLocalItems,
  type ExportedItem,
  type ExportPlan,
  type ExportRequest,
  type ExportWarning,
  fetchScopes,
  type LocalItem,
  type Ownership,
  type PlannedItem,
  planExport,
  type RefusedItem,
  type Scopes,
  type Skipped,
  type SkipReason,
  uploadExport,
} from "./export.js";
export { previewText } from "./export-command.js";
export {
  chooseTargets,
  commitInstall,
  type InstallResult,
  type Prepared,
  places,
  report,
  toolNotes,
} from "./install.js";
export { defaultIo, type Io } from "./io.js";
export { isBehind, type Outdated, outdatedItems } from "./manage.js";
export {
  applyOperation,
  movedItems,
  type Operation,
  type OperationKind,
  type OperationRequest,
  operationFingerprint,
  planOperation,
  projectState,
  removedItems,
} from "./operations.js";
export { type Output, output } from "./output.js";
export { itemPath } from "./registry-commands.js";
