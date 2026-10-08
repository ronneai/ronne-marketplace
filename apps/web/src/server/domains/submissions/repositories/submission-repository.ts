import type { ItemType } from "@ronneai/core";
import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type {
  NewReviewEvent,
  ReviewEvent,
  ReviewEventKind,
  Revision,
  RevisionFile,
} from "../models/review";
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

/** One author's submissions (063): a status (or every status but archived), a search, a type. */
export type AuthorFilters = {
  authorId: string;
  /** One status; without it, every status but `withdrawn` (archived, 057). */
  status?: SubmissionStatus;
  /** Part of the item name, any case. */
  search?: string;
  type?: ItemType;
};

export type AuthorPageQuery = AuthorFilters & {
  sort: "updated" | "name";
  dir: SortDir;
  size: number;
  cursor?: string;
};

/** A queue tab's rows (062): its statuses, and the reviewer's search and type. */
export type ReviewFilters = {
  statuses: readonly SubmissionStatus[];
  /** Only submissions whose scope is in these workspaces (091); all of them when left out. */
  workspaceIds?: readonly string[];
  /** Part of the item name or the author's name, any case. */
  search?: string;
  type?: ItemType;
};

/** `submitted` and `updated` are timestamps; `name` is the item's name. The id breaks ties. */
export type ReviewSort = "submitted" | "updated" | "name";

export type ReviewPageQuery = ReviewFilters & {
  sort: ReviewSort;
  dir: SortDir;
  size: number;
  cursor?: string;
};

/** What the submission services need from storage. Implemented with Kysely in kysely-submission-repository.ts. */
export interface SubmissionRepository {
  transaction<T>(work: (repo: SubmissionRepository) => Promise<T>): Promise<T>;
  /** A scope by name, with its workspace (091). */
  findScope(
    name: string,
  ): Promise<{ id: string; name: string; workspace: { id: string; name: string } } | null>;
  insert(submission: NewSubmission): Promise<string>;
  find(id: string): Promise<Submission | null>;
  /** Newest change first. */
  listByAuthor(authorId: string): Promise<Submission[]>;
  /**
   * Up to `limit` submissions in `statuses`, with their author's name, for scans over what's in
   * review (the dependency search, a rejected one's dependents). `oldest` orders by the first
   * submit, oldest first; `newest` by the last change, newest first. The queue pages with
   * `pageForReview` (062).
   */
  listForReview(query: {
    statuses: readonly SubmissionStatus[];
    order: "oldest" | "newest";
    limit: number;
  }): Promise<(Submission & { authorName: string })[]>;
  /**
   * Up to `limit` of an author's new items not released yet (drafts and open submissions, not
   * change proposals) of these types, whose `@scope/name` matches `search` as the catalogue's
   * does; newest change first. The dependency search's "your own" (089).
   */
  listOwnUnreleased(query: {
    authorId: string;
    types: readonly ItemType[];
    search: string;
    limit: number;
    /**
     * Only what an item in this workspace may depend on (093): its own workspace's and public
     * ones'. Null: public ones only. Omitted: no such filter.
     */
    dependableFrom?: string | null;
  }): Promise<Submission[]>;
  /** One page of an author's own submissions (keyset, 063). */
  pageByAuthor(query: AuthorPageQuery): Promise<KeysetPage<Submission>>;
  /** How many of an author's submissions the filters match, up to the count cap. */
  countByAuthor(filters: AuthorFilters): Promise<{ count: number; capped: boolean }>;
  /** How many submissions an author has in each status, for My submissions' status links. */
  statusCountsByAuthor(authorId: string): Promise<Partial<Record<SubmissionStatus, number>>>;
  /** One page of a queue tab (keyset, 062), with each author's name. */
  pageForReview(query: ReviewPageQuery): Promise<KeysetPage<Submission & { authorName: string }>>;
  /** How many submissions a queue tab's filters match, up to the count cap. */
  countForReview(filters: ReviewFilters): Promise<{ count: number; capped: boolean }>;
  /** These workspaces' ids and names by name, or every workspace's: the queue's filter (091). */
  workspacesNamed(ids: readonly string[] | "all"): Promise<{ id: string; name: string }[]>;
  /** How many have this status, in these workspaces only when given (091). */
  countByStatus(status: SubmissionStatus, workspaceIds?: readonly string[]): Promise<number>;
  /** The author's submissions that are still drafts, for the API's draft limit (037). */
  countDrafts(authorId: string): Promise<number>;
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
  /** Moves a proposal to a newer base version, with the conflicts its rebase left (017). */
  setProposalBase(id: string, baseVersionId: string, conflicts: readonly string[]): Promise<void>;
  setConflicts(id: string, conflicts: readonly string[]): Promise<void>;
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
  /**
   * For each of `submissionIds`, its latest event of `kinds`, with the actor's name, in one query
   * (058: My submissions' latest reviewer message). Submissions with none are left out.
   */
  latestEvents(
    submissionIds: readonly string[],
    kinds: readonly ReviewEventKind[],
  ): Promise<Map<string, ReviewEvent>>;
  /** In path order, by code unit, the same on every database. */
  files(submissionId: string): Promise<DraftFile[]>;
  /** Inserts the file, or replaces the one at its path. */
  writeFile(submissionId: string, file: DraftFile): Promise<void>;
  deleteFile(submissionId: string, path: string): Promise<void>;
}
