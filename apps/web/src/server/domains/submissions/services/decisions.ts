import { can } from "../../identity/models/permissions";
import type { ScanGate } from "../models/scan-gate";
import type { SubmissionStatus } from "../models/status";
import { type Why, whyEnglish } from "../models/why";
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
  | { decision: ReviewDecision; allowed: false; reason: string; why: Why };

/** Why a reviewer can't decide on their own submission. */
export const OWN_SUBMISSION_REASON = whyEnglish({ code: "own_decide" });

/** Why a stale proposal (017) can't be approved yet. */
export const rebaseReason = (stale: string) => whyEnglish({ code: "stale", newer: stale });

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
    /** The security scan's gate (137); absent or open, nothing is blocked. */
    gate?: ScanGate;
  },
): DecisionOption[] => {
  // A moderator of the submission's workspace, or root (091).
  if (!can(actor.user, "submissions.review", submission.workspace.id)) return [];
  const mine = submission.authorId === actor.user?.id;
  const own = (decision: ReviewDecision): DecisionOption =>
    mine
      ? { decision, allowed: false, reason: OWN_SUBMISSION_REASON, why: { code: "own_decide" } }
      : { decision, allowed: true };
  const approving = (decision: ReviewDecision): DecisionOption =>
    submission.stale
      ? {
          decision,
          allowed: false,
          reason: rebaseReason(submission.stale),
          why: { code: "stale", newer: submission.stale },
        }
      : { decision, allowed: true };

  const gate = submission.gate?.blocked ? submission.gate : null;
  const root = can(actor.user, "submissions.override");

  if (submission.status === "submitted")
    return [
      mine ? own("approve") : gate ? scanBlocked("approve", gate) : approving("approve"),
      own("request_changes"),
      own("reject"),
      // While the gate blocks, root's way past it is the scan override, its own included.
      ...(mine && root && !gate ? [approving("override")] : []),
      ...(gate && root ? [approving("scan_override")] : []),
    ];
  // An approved one can still be sent back before it's released (056).
  if (submission.status === "approved") return [own("request_changes")];
  return [];
};

/** A decision the security scan's gate blocks (137), with the reason. */
const scanBlocked = (
  decision: ReviewDecision,
  gate: Extract<ScanGate, { blocked: true }>,
): DecisionOption => {
  const why: Why = {
    code: "scan_blocked",
    by: gate.by,
    score: gate.score,
    threshold: gate.threshold,
  };
  return { decision, allowed: false, reason: whyEnglish(why), why };
};

/** Whether `decision` is listed and allowed. */
export const allows = (options: readonly DecisionOption[], decision: ReviewDecision): boolean =>
  options.some((option) => option.decision === decision && option.allowed);
