import { ITEM_TYPES, type ItemType } from "@ronneai/core";

/**
 * The security scan of submissions (feature 135), as root sets it: off until root turns it on,
 * the item types it scans (`skill` by default), and the analysis: `static` (the default), or
 * `semantic` when the operator has set up a provider. The scanner's command and the provider come
 * from the environment, never from here.
 */
export const SKILL_SCAN_ANALYSES = ["static", "semantic"] as const;
export type SkillScanAnalysis = (typeof SKILL_SCAN_ANALYSES)[number];

export type SkillScanPolicy = {
  enabled: boolean;
  types: ItemType[];
  analysis: SkillScanAnalysis;
};

export const DEFAULT_SKILL_SCAN_POLICY: SkillScanPolicy = {
  enabled: false,
  types: ["skill"],
  analysis: "static",
};

/** The settings' keys in `instance_settings`. */
export const SKILL_SCAN_ENABLED_KEY = "skill_scan_enabled";
export const SKILL_SCAN_TYPES_KEY = "skill_scan_types";
export const SKILL_SCAN_ANALYSIS_KEY = "skill_scan_analysis";
/** What the scanner said last, for the settings page: its version, or why it failed. */
export const SKILL_SCAN_LAST_VERSION_KEY = "skill_scan_last_version";
export const SKILL_SCAN_LAST_ERROR_KEY = "skill_scan_last_error";

export const isSkillScanAnalysis = (value: unknown): value is SkillScanAnalysis =>
  typeof value === "string" && (SKILL_SCAN_ANALYSES as readonly string[]).includes(value);

/**
 * Item types as stored (a comma-separated list) or as root picked them: known types only, each
 * once, in the order `ITEM_TYPES` has; null when none is left.
 */
export const skillScanTypesFrom = (value: string | readonly string[]): ItemType[] | null => {
  const given = new Set(
    (typeof value === "string" ? value.split(",") : value).map((t) => t.trim()),
  );
  const types = ITEM_TYPES.filter((type) => given.has(type));
  return types.length > 0 ? types : null;
};

/** A stored policy; anything a hand edit broke reads as the default, as the other settings do. */
export const skillScanPolicyFrom = (stored: {
  enabled: string | null;
  types: string | null;
  analysis: string | null;
}): SkillScanPolicy => ({
  enabled: stored.enabled === "true",
  types:
    (stored.types !== null && skillScanTypesFrom(stored.types)) || DEFAULT_SKILL_SCAN_POLICY.types,
  analysis: isSkillScanAnalysis(stored.analysis)
    ? stored.analysis
    : DEFAULT_SKILL_SCAN_POLICY.analysis,
});

/**
 * What the operator set up, as settings may show it (135): whether a scanner command is set, and
 * the provider for semantic scans (its name, model and the host the files go to), never a key.
 */
export type SkillScanner = {
  configured: boolean;
  provider: { name: string; model: string | null; host: string } | null;
};

/** Admin › Settings › Security scan. */
export type SkillScanSettings = {
  policy: SkillScanPolicy;
  scanner: SkillScanner;
  lastVersion: string | null;
  lastError: string | null;
  /** Semantic is chosen but no provider is set up any more: scans run static. */
  runsStatic: boolean;
};
