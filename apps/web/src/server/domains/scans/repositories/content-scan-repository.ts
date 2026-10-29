import type { SkillScanResult } from "@ronneai/core";
import type { ScanError, ScanFile } from "../models/scan";

/** A scan as the job and the review page read it (feature 135). */
export type ContentScan = {
  id: string;
  revisionId: string;
  status: "queued" | "running" | "done" | "failed";
  attempts: number;
  /** Set once done. */
  result: SkillScanResult | null;
  /** The provider and model of a semantic scan, as the operator set them. */
  llm: { provider: string; model: string | null } | null;
  error: ScanError | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

/** What the scans need from storage. */
export interface ContentScanRepository {
  /** Queues a scan of the revision. */
  queue(revisionId: string, at: Date): Promise<string>;
  /**
   * The oldest queued scan, marked running with one more attempt, or null when none is queued. The
   * job's lease means one taker at a time; the update is conditional all the same.
   */
  takeNext(at: Date): Promise<ContentScan | null>;
  /**
   * Running scans started before `before`: those with fewer than `maxAttempts` go back to the
   * queue, the others fail with `timeout`. Returns how many of each.
   */
  recoverStuck(
    before: Date,
    maxAttempts: number,
    at: Date,
  ): Promise<{ requeued: number; failed: number }>;
  /**
   * Puts a running scan back in the queue when it has had fewer than `maxAttempts` (156: the
   * scanner service was busy). False when its attempts are used up, or it isn't running.
   */
  putBack(id: string, maxAttempts: number): Promise<boolean>;
  /**
   * The revision's files, or null when there's nothing to scan: the revision is gone, or its
   * submission was withdrawn (archived) while the scan waited.
   */
  revisionFiles(revisionId: string): Promise<ScanFile[] | null>;
  /** Removes a scan that won't run (its submission was withdrawn). */
  discard(id: string): Promise<void>;
  /**
   * Whether a run has work: a scan waiting, or one stuck `running` since before `stuckBefore`
   * (Ronne's process died during it), so the scheduler knows to take the lease.
   */
  hasWork(stuckBefore: Date): Promise<boolean>;
  finish(
    id: string,
    outcome:
      | {
          ok: true;
          result: SkillScanResult;
          llm: { provider: string; model: string | null } | null;
        }
      | { ok: false; error: ScanError },
    at: Date,
  ): Promise<void>;
  /** The newest scan of each revision, by revision id. */
  latestFor(revisionIds: readonly string[]): Promise<Map<string, ContentScan>>;
  /** Records what the scanner said last, for the settings page. */
  recordLast(outcome: { version: string } | { error: ScanError }, at: Date): Promise<void>;
}
