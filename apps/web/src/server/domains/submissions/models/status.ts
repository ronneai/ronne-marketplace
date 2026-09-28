import { InvalidStatusTransitionError } from "../exceptions/errors";

/** A submission's statuses (MVP §4.1). */
export const SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
  "published",
] as const;

export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

export const isSubmissionStatus = (value: string): value is SubmissionStatus =>
  (SUBMISSION_STATUSES as readonly string[]).includes(value);

/** What can happen to a submission; each one is a move in MVP §4.1's diagram. */
export type SubmissionAction =
  | "submit"
  | "resubmit"
  | "request_changes"
  | "approve"
  | "reject"
  | "withdraw"
  | "publish"
  | "rebase";

/**
 * Every allowed move, and the only place they're decided: services call `transition`. 013 uses
 * submit and withdraw; review (014) and release (015) use the rest. Withdrawing is allowed until
 * approval (owner decision, 2026-09-27).
 */
export const TRANSITIONS: Record<
  SubmissionAction,
  { from: readonly SubmissionStatus[]; to: SubmissionStatus }
> = {
  submit: { from: ["draft"], to: "submitted" },
  resubmit: { from: ["changes_requested"], to: "submitted" },
  request_changes: { from: ["submitted"], to: "changes_requested" },
  approve: { from: ["submitted"], to: "approved" },
  reject: { from: ["submitted"], to: "rejected" },
  withdraw: { from: ["draft", "submitted", "changes_requested"], to: "withdrawn" },
  publish: { from: ["approved"], to: "published" },
  // A stale proposal under review, or approved, goes back to its author to rebase (017). Drafts and
  // proposals sent back for changes rebase in place.
  rebase: { from: ["submitted", "approved"], to: "changes_requested" },
};

export const canTransition = (from: SubmissionStatus, action: SubmissionAction): boolean =>
  TRANSITIONS[action].from.includes(from);

/** The status `action` leads to from `from`, or InvalidStatusTransitionError. */
export const transition = (from: SubmissionStatus, action: SubmissionAction): SubmissionStatus => {
  if (!canTransition(from, action)) throw new InvalidStatusTransitionError(from, action);
  return TRANSITIONS[action].to;
};

/**
 * What the author can edit: a draft, and a submission sent back for changes (014), which they fix
 * and resubmit. Renaming and deleting stay draft-only.
 */
export const isEditable = (status: SubmissionStatus): boolean =>
  status === "draft" || status === "changes_requested";

/** Submissions that hold their name against others: a draft doesn't (MVP §4.1, spec 013). */
export const OPEN_STATUSES: readonly SubmissionStatus[] = [
  "submitted",
  "changes_requested",
  "approved",
];

/** How a status reads on a page: `changes_requested` is "changes requested". */
export const statusLabel = (status: SubmissionStatus): string => status.replace("_", " ");
