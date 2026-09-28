import type { DraftFile } from "./submission";

/**
 * Review (feature 014): snapshots of a submission's files, and its conversation. Plain data only:
 * the review page renders it.
 */

/** A snapshot made on every submit and resubmit. Reviewers read it; releases pack it (015). */
export type Revision = {
  id: string;
  submissionId: string;
  /** 1 for the first submit, then one more for each resubmit. */
  number: number;
  createdBy: string;
  createdAt: Date;
};

export type RevisionFile = Omit<DraftFile, "updatedAt">;

export const REVIEW_EVENT_KINDS = [
  "submit",
  "resubmit",
  "comment",
  "request_changes",
  "approve",
  "reject",
  "override",
  "withdraw",
  "publish",
  "rebase",
] as const;

export type ReviewEventKind = (typeof REVIEW_EVENT_KINDS)[number];

/** One entry of the conversation: a comment, a decision, or the author submitting or withdrawing. */
export type ReviewEvent = {
  id: string;
  submissionId: string;
  actor: { id: string; name: string };
  kind: ReviewEventKind;
  body: string | null;
  /** The revision it's about; null for a draft withdrawn before its first submit. */
  revision: number | null;
  createdAt: Date;
};

export type NewReviewEvent = {
  submissionId: string;
  actorId: string;
  kind: ReviewEventKind;
  body: string | null;
  revision: number | null;
  createdAt: Date;
};
