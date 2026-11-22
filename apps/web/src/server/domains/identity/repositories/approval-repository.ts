import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { QueuedMail, QueueResult } from "../../mail/services/outbox";

/** An account that signed up and waits for a root's approval (190), as read under its lock. */
export type WaitingAccount = { id: string; email: string; locale: string | null; since: Date };

/** Approving and declining self-registered accounts (190), as the approval service sees them. */
export interface ApprovalRepository {
  /** One transaction; the emails it queued go to the scheduler once it has committed (189). */
  transaction<T>(work: (repo: ApprovalRepository) => Promise<T>): Promise<T>;
  /**
   * The account, its row locked until the transaction ends, so two roots answering at once are
   * one after the other: `waiting`, `approved` (it exists and doesn't wait) or `gone`.
   */
  lockAccount(
    userId: string,
  ): Promise<{ state: "waiting"; account: WaitingAccount } | { state: "approved" | "gone" }>;
  /** Clears the mark: the account can sign in. */
  approve(userId: string, at: Date): Promise<void>;
  /** Deletes an account that waited (it never signed in, so it holds nothing else). */
  deleteWaiting(userId: string): Promise<void>;
  /** The accounts waiting since before `cutoff`, oldest first, at most `limit`. */
  waitingSince(cutoff: Date, limit: number): Promise<string[]>;
  queueMail(mail: QueuedMail, now: Date): Promise<QueueResult>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
