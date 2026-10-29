import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import type { ServiceHealth } from "../../scans/models/scan";

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
/** The scanner's setup as root sets it in the web (136); the environment's, when set, wins. */
export const SKILL_SCAN_PROVIDER_KEY = "skill_scan_provider";
export const SKILL_SCAN_MODEL_KEY = "skill_scan_model";
export const SKILL_SCAN_ENDPOINT_KEY = "skill_scan_endpoint";
export const SKILL_SCAN_TIMEOUT_KEY = "skill_scan_timeout";
/** The index of the chosen command in the operator's RONNE_SKILL_SCANNERS. */
export const SKILL_SCAN_COMMAND_KEY = "skill_scan_command";
/** The provider's API key, sealed (`instance-secrets.ts`); empty once removed. */
export const SKILL_SCAN_KEY_ENC_KEY = "skill_scan_key_enc";
export const SKILL_SCAN_SETUP_KEYS = [
  SKILL_SCAN_PROVIDER_KEY,
  SKILL_SCAN_MODEL_KEY,
  SKILL_SCAN_ENDPOINT_KEY,
  SKILL_SCAN_TIMEOUT_KEY,
  SKILL_SCAN_COMMAND_KEY,
  SKILL_SCAN_KEY_ENC_KEY,
] as const;

/** The setup's stored values, as read from `instance_settings` (null when never set). */
export type StoredScanSetup = {
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  timeout: string | null;
  command: string | null;
  keyEnc: string | null;
};

/**
 * The score from which the security scan blocks approval (137): empty, no gate (the default), or a
 * whole number from 1 to 100.
 */
export const SKILL_SCAN_BLOCK_SCORE_KEY = "skill_scan_block_score";

/** A threshold as stored or typed: a whole number from 1 to 100, else null (no gate). */
export const blockScoreFrom = (value: string | null | undefined): number | null => {
  const text = (value ?? "").trim();
  if (!/^\d{1,3}$/.test(text)) return null;
  const score = Number(text);
  return score >= 1 && score <= 100 ? score : null;
};

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
  /** The setup's sources and root's stored values (136). */
  setup?: ScanSetupShown;
  /** The scanner services (156) and their state, static first; only on the settings page. */
  services?: ScannerServiceState[];
};

/**
 * One scanner service as the tab shows it (156): its address (the operator's, never secret), whether
 * it's compose's (the proxy's ports, so the tab can give the command that starts it) and its state.
 */
export type ScannerServiceState = {
  kind: "static" | "semantic";
  address: string;
  compose: boolean;
  health: ServiceHealth;
};

/**
 * Where the scanner's setup comes from and what root stored (136), as the tab shows it: the
 * operator's commands by file name, what the environment fixes, and whether a key is stored. Never
 * the key, and never a command's arguments.
 */
export type ScanSetupShown = {
  /** "service": the scanner service's address is set (156), and no command runs. */
  commandFrom: "service" | "environment" | "list" | null;
  /** What's wrong with the service's addresses (156), for the tab to say. */
  serviceProblems: ScanServiceProblem[];
  commands: { index: number; name: string }[];
  chosenCommand: number | null;
  commandDropped: boolean;
  timeoutFrom: "environment" | "settings" | "default";
  timeoutSeconds: number;
  providerFrom: "environment" | "settings" | null;
  /** The providers root may pick, with the fields each takes. */
  providers: { name: string; takesKey: boolean; hasEndpoint: boolean; needsEndpoint: boolean }[];
  stored: {
    provider: string | null;
    model: string | null;
    endpoint: string | null;
    key: "set" | "unreadable" | "none";
  };
};

/**
 * An address the operator set for the scanner service that can't be used (156): the static one
 * or the semantic one isn't a plain http(s) address, or a semantic one is set with no static one.
 */
export type ScanServiceProblem = "url" | "semanticUrl" | "semanticAlone";

/** Admin › Settings › Security scan. */
export type SkillScanSettings = {
  policy: SkillScanPolicy;
  /** The score from which approval is blocked (137); null for none. */
  blockScore: number | null;
  scanner: SkillScanner;
  lastVersion: string | null;
  lastError: string | null;
  /** Semantic is chosen but no provider is set up any more: scans run static. */
  runsStatic: boolean;
};
