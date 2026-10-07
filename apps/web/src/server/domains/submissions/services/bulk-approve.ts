import { isId } from "../../../db/ids";
import { can, requireInSome } from "../../identity/models/permissions";
import {
  BulkLimitError,
  InvalidStatusTransitionError,
  OwnSubmissionError,
  RevisionChangedError,
  SubmissionNotFoundError,
  SubmissionStaleError,
} from "../exceptions/errors";
import { type SubmissionStatus, statusLabel } from "../models/status";
import type { Submission } from "../models/submission";
import { MAX_BULK } from "./bulk-submit";
import { decide, messageFrom } from "./reviews";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/**
 * Approving many submissions at once (feature 054): 014's `decide` for each, in its own
 * transaction with its row locked, so one that can't be approved any more doesn't stop the others.
 * Root's own submissions are approved as overrides. One optional message goes on every approval.
 */

/** The most submissions one request approves, as for submitting (052). */
export const MAX_BULK_APPROVE = MAX_BULK;

/** Whether this reviewer can approve a submission now, as an override when it's root's own. */
export type Approvability =
  | { approvable: true; override: boolean }
  | { approvable: false; reason: string };

/** What the queue and approving many agree on: submitted, not stale, and not a moderator's own. */
export const approvability = (
  actor: SubmissionActor,
  submission: { status: SubmissionStatus; authorId: string; stale: string | null },
): Approvability => {
  if (submission.status !== "submitted")
    return { approvable: false, reason: `It's ${statusLabel(submission.status)}` };
  if (submission.stale)
    return { approvable: false, reason: `Rebase needed: ${submission.stale} is out` };
  const mine = submission.authorId === actor.user?.id;
  if (mine && !can(actor.user, "submissions.override"))
    return { approvable: false, reason: "Your own submission" };
  return { approvable: true, override: mine };
};

export type ApprovedSubmission =
  | {
      id: string;
      result: "approved";
      submission: Submission;
      override: boolean;
      revision: number | null;
    }
  | { id: string; result: "not_found" }
  | { id: string; result: "not_approvable"; submission: Submission; reason: string };

/**
 * Approves each submission, in the order given. The checks run inside each decision, so one decided
 * by someone else, withdrawn or gone stale since the page loaded is reported, and the others go.
 */
export const approveMany = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  /** Each with the revision its row showed: an approval goes only if it's still the latest. */
  input: { items: readonly { id: string; revision: number | null }[]; message?: string },
): Promise<ApprovedSubmission[]> => {
  requireInSome(actor.user, "submissions.review");
  const reviewed = new Map(input.items.map((item) => [item.id, item.revision]));
  const ids = [...reviewed.keys()];
  if (ids.length > MAX_BULK_APPROVE) throw new BulkLimitError(ids.length, MAX_BULK_APPROVE);
  const message = messageFrom(input.message, null) ?? undefined;
  const results: ApprovedSubmission[] = [];
  for (const id of ids) {
    const before = isId(id) ? await deps.repo.find(id) : null;
    if (!before) {
      results.push({ id, result: "not_found" });
      continue;
    }
    const override = before.authorId === actor.user?.id && can(actor.user, "submissions.override");
    try {
      const submission = await decide(deps, actor, id, {
        decision: override ? "override" : "approve",
        message,
        via: "bulk",
        revision: reviewed.get(id) ?? null,
      });
      const revision = (await deps.repo.revisions(id)).at(-1)?.number ?? null;
      results.push({ id, result: "approved", submission, override, revision });
    } catch (error) {
      if (error instanceof SubmissionNotFoundError) results.push({ id, result: "not_found" });
      else if (
        error instanceof InvalidStatusTransitionError ||
        error instanceof OwnSubmissionError ||
        error instanceof SubmissionStaleError ||
        error instanceof RevisionChangedError
      )
        results.push({ id, result: "not_approvable", submission: before, reason: error.message });
      else throw error;
    }
  }
  return results;
};
