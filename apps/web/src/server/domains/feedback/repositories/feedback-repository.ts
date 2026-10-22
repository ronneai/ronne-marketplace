import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type {
  CheckedFeedback,
  FeedbackEntry,
  FeedbackKind,
  FeedbackStatus,
} from "../models/feedback";

export type FeedbackFilters = {
  /** Text in the message, or the sender's name or email. */
  search?: string;
  kind?: FeedbackKind;
  status?: FeedbackStatus;
};

/** `created` sorts by the id (a ULID); `kind` by the kind, then the id. */
export type FeedbackSort = "created" | "kind";

export type FeedbackPageQuery = FeedbackFilters & {
  sort: FeedbackSort;
  dir: SortDir;
  size: number;
  cursor?: string;
};

/** Builds the audit event for one row, so each row's event names its own id (never its text). */
export type FeedbackAudit = (id: string) => NewAuditEvent;

/** Feedback storage (feature 127). Kysely in kysely-feedback-repository.ts. */
export interface FeedbackRepository {
  insert(
    userId: string,
    feedback: CheckedFeedback,
    options: { version: string; at: Date; id?: string },
  ): Promise<string>;
  page(query: FeedbackPageQuery): Promise<KeysetPage<FeedbackEntry>>;
  count(filters: FeedbackFilters): Promise<{ count: number; capped: boolean }>;
  find(id: string): Promise<FeedbackEntry | null>;
  /** How many are still new. */
  countNew(): Promise<number>;
  /**
   * Marks these rows handled, those still new only; returns the ids that changed. `audit` is
   * recorded for each of them, in the same transaction.
   */
  markHandled(
    ids: readonly string[],
    options: { by: string; at: Date; audit?: FeedbackAudit },
  ): Promise<string[]>;
  /** Deletes these rows; returns the ids that existed. `audit` is recorded for each of them. */
  remove(ids: readonly string[], options: { at: Date; audit?: FeedbackAudit }): Promise<string[]>;
}
