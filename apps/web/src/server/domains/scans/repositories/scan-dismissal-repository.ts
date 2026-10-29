import type { SkillScanFinding } from "@ronneai/core";
import type { NewAuditEvent } from "../../audit/models/audit-event";

/** What a reviewer's mark says (137): the finding is wrong, or it's real and the risk accepted. */
export const DISMISSAL_KINDS = ["false_positive", "accepted"] as const;
export type DismissalKind = (typeof DISMISSAL_KINDS)[number];

/** A finding a reviewer marked (137): its position in the scan, the kind of mark, and why. */
export type Dismissal = {
  finding: number;
  kind: DismissalKind;
  reason: string;
  by: { id: string; name: string | null };
  at: Date;
};

/** What a dismissal needs to know of its scan: whose submission it is, and its findings. */
export type DismissalTarget = {
  scanId: string;
  status: "queued" | "running" | "done" | "failed";
  findings: SkillScanFinding[];
  revision: number;
  submission: {
    id: string;
    authorId: string;
    /** A draft (one sent back to draft, say) is its author's alone, as everywhere. */
    status: string;
    name: string;
    scope: { name: string };
    workspace: { id: string; name: string };
  };
};

export interface ScanDismissalRepository {
  /** Runs `work` in one transaction, with a repository on it. */
  transaction<T>(work: (repo: ScanDismissalRepository) => Promise<T>): Promise<T>;
  /**
   * Locks the scan's row until the transaction ends, so marks and restores of one scan run one at
   * a time (and can't deadlock each other on the unique index).
   */
  lockScan(scanId: string): Promise<void>;
  /** The scan and its submission; null when the scan doesn't exist. */
  target(scanId: string): Promise<DismissalTarget | null>;
  /** Each scan's dismissals, by finding; scans with none are left out. */
  dismissals(scanIds: readonly string[]): Promise<Map<string, Dismissal[]>>;
  /** False when that finding is dismissed already. */
  dismiss(input: {
    scanId: string;
    finding: number;
    kind: DismissalKind;
    userId: string;
    reason: string;
    at: Date;
  }): Promise<boolean>;
  /** False when that finding wasn't dismissed. */
  restore(scanId: string, finding: number): Promise<boolean>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
