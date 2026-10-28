export {
  type Frontmatter,
  normalizeFrontmatter,
  parseFrontmatter,
  quoteItemNames,
} from "./frontmatter.js";
export { fieldName, hasErrors, type ManifestIssue } from "./issues.js";
export {
  DEPENDENCY_TYPES,
  ITEM_TYPES,
  type ItemType,
  isItemType,
  mayDependOn,
  mayHaveDependencies,
} from "./item-types.js";
export { DEFAULT_LIMITS, formatBytes, type PackageLimits } from "./limits.js";
export { MANIFEST_MAX_BYTES, type Manifest, parseManifest } from "./manifest.js";
export {
  canonicalItemName,
  formatItemName,
  formatScopeName,
  GLOBAL_WORKSPACE,
  ITEM_NAME_MAX_LENGTH,
  type ItemRef,
  isValidName,
  NAME_MAX_LENGTH,
  NAME_PROBLEM_MESSAGES,
  type NameKind,
  type NameProblem,
  nameProblem,
  normalizeScopeName,
  normalizeWorkspaceName,
  PERSONAL_NAME_BASE_LENGTH,
  parseItemName,
  parseScopeName,
  personalWorkspaceBase,
  personalWorkspaceName,
  RESERVED_SCOPES,
  RESERVED_WORKSPACES,
  type ScopeRef,
  sameItemName,
  scopeRefFrom,
  shortItemName,
  typedNameParts,
} from "./names.js";
export { dependenciesFirst } from "./order.js";
export {
  checkPackage,
  PATH_MAX,
  type PathProblem,
  pathProblem,
  pathProblemOf,
  secretLike,
} from "./package-checks.js";
export type { PackageFile } from "./package-file.js";
export {
  REQUESTED,
  type RegistryItem,
  type RegistryReader,
  type RegistryVersion,
  type Resolution,
  type ResolvedItem,
  ResolveError,
  type ResolveErrorCode,
  type ResolveRequest,
  type ResolveWarning,
  resolve,
} from "./resolve.js";
export { type RiskFlag, type RiskFlagKind, riskFlags } from "./risk-flags.js";
export { manifestSchema } from "./schema/index.js";
export {
  parseSkillScan,
  SKILL_SCAN_MAX_FINDINGS,
  SKILL_SCAN_MAX_TEXT,
  SKILL_SCAN_RECOMMENDATIONS,
  SKILL_SCAN_SEVERITIES,
  type SkillScanFinding,
  type SkillScanParse,
  type SkillScanRecommendation,
  type SkillScanResult,
  type SkillScanSeverity,
} from "./skill-scan/parse-skill-scan.js";
export {
  type Bump,
  bothRanges,
  compareNewestFirst,
  defaultTag,
  highestMatching,
  highestStable,
  isVersionRange,
  nextVersion,
  PRERELEASE_ID,
  type ReleaseChoice,
  supersededBy,
  type TagProblem,
  tagProblem,
  tagProblemOf,
} from "./versions.js";
