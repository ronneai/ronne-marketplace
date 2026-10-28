import type { SkillScanResult } from "@ronneai/core";

/** A file of the revision to scan, as it's stored (feature 135). */
export type ScanFile = { path: string; bytes: Uint8Array; executable: boolean };

/**
 * Why a scan didn't finish, short and written by Ronne: stored in `content_scans.error` and shown
 * on the review page. Never the scanner's own output, which can echo item content.
 */
export type ScanError =
  | "not configured"
  | "not found"
  | "not runnable"
  | "no temporary folder"
  | "bad file path"
  | "write failed"
  | "timeout"
  | "output too large"
  | "invalid report"
  | "signal"
  | `exit ${number}`;

export type ScanOutcome = { ok: true; result: SkillScanResult } | { ok: false; error: ScanError };

/**
 * The LLM provider the operator set up for semantic scans (`RONNE_SKILL_SCANNER_ENV_*`, 135).
 * `variables` go to the scanner only, and hold its key: settings and the review panel show `name`,
 * `model` and `host`, never `variables`.
 */
export type ScanProvider = {
  /** SkillSpector's provider name, such as `ollama` or `openai`. */
  name: string;
  model: string | null;
  /** The host the files go to: from the endpoint the operator set, or the provider's own. */
  host: string;
  variables: Record<string, string>;
};

/** Runs one scan of a revision's files. Never throws for anything the scanner does. */
export interface SkillScanner {
  /** Semantic only when asked for and a provider is set up; otherwise static (`--no-llm`). */
  scan(files: readonly ScanFile[], options?: { semantic?: boolean }): Promise<ScanOutcome>;
}
