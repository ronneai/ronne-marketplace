import { isId } from "../../../db/ids";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can, canInSome } from "../../identity/models/permissions";
import {
  BulkLimitError,
  InvalidStatusTransitionError,
  OwnSubmissionError,
  RevisionChangedError,
  ScanBlockedError,
  SubmissionNotFoundError,
  SubmissionStaleError,
} from "../exceptions/errors";
import type { ScanGate } from "../models/scan-gate";
import type { SubmissionStatus } from "../models/status";
import type { Submission } from "../models/submission";
import { type Why, whyEnglish } from "../models/why";
import { MAX_BULK } from "./bulk-submit";
import { decide, messageFrom, OVERRIDE_REASON } from "./reviews";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/**
 * Approving many submissions at once (feature 054): 014's `decide` for each, in its own
 * transaction with its row locked, so one that can't be approved any more doesn't stop the others.
 * Root's own submissions are approved as overrides. One message goes on every approval: optional,
 * and required when the selection holds an override (163).
 */

/** The most submissions one request approves, as for submitting (052). */
export const MAX_BULK_APPROVE = MAX_BULK;

/** Whether this reviewer can approve a submission now, as an override when it's root's own. */
export type Approvability =
  | { approvable: true; override: boolean }
  | { approvable: false; reason: string; why: Why };

/** A refusal: the English sentence and its code (131). */
const notApprovable = (why: Why) => ({ approvable: false as const, reason: whyEnglish(why), why });

/** Why a reviewer skips a submission outside the workspaces they moderate (091). */
export const notAModeratorIn = (workspace: string) =>
  whyEnglish({ code: "not_moderator", workspace });

/**
 * What the queue and approving many agree on: in a workspace the reviewer moderates (091),
 * submitted, not stale, and not a moderator's own.
 */
export const approvability = (
  actor: SubmissionActor,
  submission: {
    status: SubmissionStatus;
    authorId: string;
    stale: string | null;
    workspace: { id: string; name: string };
    /** The security scan's gate (137). Approving many never overrides it. */
    gate?: ScanGate;
  },
): Approvability => {
  if (!can(actor.user, "submissions.review", submission.workspace.id))
    return notApprovable({ code: "not_moderator", workspace: submission.workspace.name });
  if (submission.status !== "submitted")
    return notApprovable({ code: "status", status: submission.status });
  if (submission.stale) return notApprovable({ code: "stale", newer: submission.stale });
  if (submission.gate?.blocked) {
    const { by, score, threshold } = submission.gate;
    return notApprovable({ code: "scan_blocked", by, score, threshold });
  }
  const mine = submission.authorId === actor.user?.id;
  if (mine && !can(actor.user, "submissions.override")) return notApprovable({ code: "own" });
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
  | { id: string; result: "not_approvable"; submission: Submission; reason: string; why: Why };

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
  if (!canInSome(actor.user, "submissions.review")) throw new ForbiddenError("submissions.review");
  const reviewed = new Map(input.items.map((item) => [item.id, item.revision]));
  const ids = [...reviewed.keys()];
  if (ids.length > MAX_BULK_APPROVE) throw new BulkLimitError(ids.length, MAX_BULK_APPROVE);
  const found = new Map<string, Submission | null>();
  for (const id of ids) found.set(id, isId(id) ? await deps.repo.find(id) : null);
  // Root's own submitted ones go as overrides, which need a reason (163). It's asked for before
  // any is approved, so a selection is never left half done.
  const overrides = [...found.values()].some(
    (s) =>
      s != null &&
      s.status === "submitted" &&
      s.authorId === actor.user?.id &&
      can(actor.user, "submissions.override"),
  );
  const message = messageFrom(input.message, overrides ? OVERRIDE_REASON : null) ?? undefined;
  const results: ApprovedSubmission[] = [];
  for (const id of ids) {
    const before = found.get(id) ?? null;
    if (!before) {
      results.push({ id, result: "not_found" });
      continue;
    }
    // Each is checked in its own workspace (091). One the reviewer can't see is "not found", as
    // everywhere, so a bulk request doesn't reveal another workspace's submissions.
    if (
      before.authorId !== actor.user?.id &&
      !can(actor.user, "submissions.view_submitted", before.workspace.id)
    ) {
      results.push({ id, result: "not_found" });
      continue;
    }
    if (!can(actor.user, "submissions.review", before.workspace.id)) {
      results.push({
        id,
        result: "not_approvable",
        submission: before,
        reason: notAModeratorIn(before.workspace.name),
        why: { code: "not_moderator", workspace: before.workspace.name },
      });
      continue;
    }
    const override = before.authorId === actor.user?.id && can(actor.user, "submissions.override");
    // Root's own that isn't submitted any more is refused for its status, not for the reason the
    // override would need (163), so the rest of the selection still goes.
    if (override && before.status !== "submitted") {
      const why: Why = { code: "status", status: before.status };
      results.push({
        id,
        result: "not_approvable",
        submission: before,
        reason: whyEnglish(why),
        why,
      });
      continue;
    }
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
        error instanceof RevisionChangedError ||
        error instanceof ScanBlockedError
      )
        results.push({
          id,
          result: "not_approvable",
          submission: before,
          reason: error.message,
          why: { code: "error", error },
        });
      else throw error;
    }
  }
  return results;
};
