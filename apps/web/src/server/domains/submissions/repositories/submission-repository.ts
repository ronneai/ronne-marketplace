import type { ItemType } from "@ronneai/core";
import type { DraftFile, Submission, SubmissionStatus } from "../models/submission";

export type NewSubmission = {
  authorId: string;
  scopeId: string;
  name: string;
  type: ItemType;
  status: SubmissionStatus;
  createdAt: Date;
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
  /** In path order, by code unit, the same on every database. */
  files(submissionId: string): Promise<DraftFile[]>;
  /** Inserts the file, or replaces the one at its path. */
  writeFile(submissionId: string, file: DraftFile): Promise<void>;
  deleteFile(submissionId: string, path: string): Promise<void>;
}
