import { can } from "../../identity/models/permissions";
import type { SubmissionStatus } from "../models/status";
import type { ReviewDecision } from "./reviews";
import type { SubmissionActor } from "./submissions";

/**
 * Who may decide what (feature 058), in one place: the review page and each row of the review
 * queue both ask it, so they never disagree. The rules are 014's, 017's and 056's; `decide` checks
 * them again in its transaction.
 */

/** A decision the viewer is shown: allowed, or disabled with the reason. */
export type DecisionOption =
  | { decision: ReviewDecision; allowed: true }
  | { decision: ReviewDecision; allowed: false; reason: string };

/** Why a reviewer can't decide on their own submission. */
export const OWN_SUBMISSION_REASON = "Your own submission: another moderator or root decides.";

/** Why a stale proposal (017) can't be approved yet. */
export const rebaseReason = (stale: string) => `Rebase needed: ${stale} is out`;

/**
 * The decisions a viewer sees on a submission, in the order the buttons show them. A decision that
 * doesn't apply to the status (Reject on an approved one) isn't listed; one that applies but isn't
 * the viewer's to make (their own submission, a stale proposal) is listed, disabled, with the reason.
 * Root's override shows only on root's own submission.
 */
export const decisionsFor = (
  actor: SubmissionActor,
  submission: {
    status: SubmissionStatus;
    authorId: string;
    stale: string | null;
    workspace: { id: string };
  },
): DecisionOption[] => {
  // A moderator of the submission's workspace, or root (091).
  if (!can(actor.user, "submissions.review", submission.workspace.id)) return [];
  const mine = submission.authorId === actor.user?.id;
  const own = (decision: ReviewDecision): DecisionOption =>
    mine
      ? { decision, allowed: false, reason: OWN_SUBMISSION_REASON }
      : { decision, allowed: true };
  const approving = (decision: ReviewDecision): DecisionOption =>
    submission.stale
      ? { decision, allowed: false, reason: rebaseReason(submission.stale) }
      : { decision, allowed: true };

  if (submission.status === "submitted")
    return [
      mine ? own("approve") : approving("approve"),
      own("request_changes"),
      own("reject"),
      ...(mine && can(actor.user, "submissions.override") ? [approving("override")] : []),
    ];
  // An approved one can still be sent back before it's released (056).
  if (submission.status === "approved") return [own("request_changes")];
  return [];
};

/** Whether `decision` is listed and allowed. */
export const allows = (options: readonly DecisionOption[], decision: ReviewDecision): boolean =>
  options.some((option) => option.decision === decision && option.allowed);
