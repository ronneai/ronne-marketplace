/** Every item type a manifest can declare. See docs/spec/manifest.md §2. */
export const ITEM_TYPES = [
  "skill",
  "agent",
  "rule",
  "command",
  "hook",
  "mcp-server",
  "permission-policy",
  "output-style",
  "statusline",
  "lsp-server",
  "bundle",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const isItemType = (value: string): value is ItemType => {
  return (ITEM_TYPES as readonly string[]).includes(value);
};

export { fieldName, hasErrors, type ManifestIssue } from "./issues.js";
export { DEFAULT_LIMITS, formatBytes, type PackageLimits } from "./limits.js";
export { MANIFEST_MAX_BYTES, type Manifest, parseManifest } from "./manifest.js";
export {
  isValidName,
  NAME_MAX_LENGTH,
  NAME_PROBLEM_MESSAGES,
  type NameProblem,
  nameProblem,
  normalizeScopeName,
  parseItemName,
  RESERVED_SCOPES,
} from "./names.js";
export { checkPackage, pathProblem, secretLike } from "./package-checks.js";
export type { PackageFile } from "./package-file.js";
export { manifestSchema } from "./schema/index.js";
