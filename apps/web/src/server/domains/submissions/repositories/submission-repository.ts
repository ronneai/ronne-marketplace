import type { ItemType } from "@ronneai/core";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { NewReviewEvent, ReviewEvent, Revision, RevisionFile } from "../models/review";
import type { DraftFile, Submission, SubmissionStatus } from "../models/submission";
import type { RegistryLookup } from "./registry-lookup";

export type NewSubmission = {
  authorId: string;
  scopeId: string;
  name: string;
  type: ItemType;
  status: SubmissionStatus;
  createdAt: Date;
  /** For a change proposal (017): the item and the version it starts from. */
  proposal?: { itemId: string; baseVersionId: string };
};

/** What the submission services need from storage. Implemented with Kysely in kysely-submission-repository.ts. */
export interface SubmissionRepository {
  transaction<T>(work: (repo: SubmissionRepository) => Promise<T>): Promise<T>;
  findScope(name: string): Promise<{ id: string; name: string } | null>;
  insert(submission: NewSubmission): Promise<string>;
  find(id: string): Promise<Submission | null>;
  /** Newest change first. */
  listByAuthor(authorId: string): Promise<Submission[]>;
  /**
   * Submissions in `statuses`, with their author's name, for the review queue (014). `oldest`
   * orders by the first submit, oldest first; `newest` by the last change, newest first, and pages
   * from `after` (the last row of the previous page).
   */
  listForReview(query: {
    statuses: readonly SubmissionStatus[];
    order: "oldest" | "newest";
    limit: number;
    after?: { updatedAt: Date; id: string };
  }): Promise<(Submission & { authorName: string })[]>;
  countByStatus(status: SubmissionStatus): Promise<number>;
  /** A user's display name, or null if there's no such user. */
  userName(userId: string): Promise<string | null>;
  /**
   * Whether another submission with one of `statuses` proposes this scope and name. The registry
   * check (013) asks it inside the submit transaction.
   */
  isNameProposed(
    scopeId: string,
    name: string,
    statuses: readonly SubmissionStatus[],
    exceptId: string,
  ): Promise<boolean>;
  update(id: string, changes: { scopeId?: string; name?: string; updatedAt: Date }): Promise<void>;
  delete(id: string): Promise<void>;
  /** Sets the status, and `submitted_at` when given. */
  setStatus(
    id: string,
    status: SubmissionStatus,
    at: { updatedAt: Date; submittedAt?: Date },
  ): Promise<void>;
  /**
   * Locks the scope's row until the transaction ends, so submits in one scope run one at a time
   * and two submissions can't both take a name.
   */
  lockScope(scopeId: string): Promise<void>;
  /** Locks the submission's row until the transaction ends, so two decisions can't both pass. */
  lockSubmission(id: string): Promise<void>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
  /**
   * Published items, read on the same connection: inside a transaction, the registry checks see
   * what it has locked, and SQLite, which has one connection, doesn't wait on itself.
   */
  registry(): RegistryLookup;
  /** Snapshots `files` as the submission's next revision (feature 014). */
  createRevision(
    submissionId: string,
    createdBy: string,
    files: readonly DraftFile[],
    at: Date,
  ): Promise<Revision>;
  /** Oldest first. */
  revisions(submissionId: string): Promise<Revision[]>;
  /** In path order, by code unit. */
  revisionFiles(revisionId: string): Promise<RevisionFile[]>;
  addEvent(event: NewReviewEvent): Promise<string>;
  /** The conversation, oldest first, with each actor's name. */
  events(submissionId: string): Promise<ReviewEvent[]>;
  /** In path order, by code unit, the same on every database. */
  files(submissionId: string): Promise<DraftFile[]>;
  /** Inserts the file, or replaces the one at its path. */
  writeFile(submissionId: string, file: DraftFile): Promise<void>;
  deleteFile(submissionId: string, path: string): Promise<void>;
}
