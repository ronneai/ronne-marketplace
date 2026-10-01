import { hasErrors, type ManifestIssue } from "@ronneai/core";
import { isId } from "../../../db/ids";
import { requirePermission } from "../../identity/models/permissions";
import {
  InvalidStatusTransitionError,
  SubmissionInvalidError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import { isEditable } from "../models/status";
import type { Submission } from "../models/submission";
import {
  checkSubmission,
  type SubmissionActor,
  type SubmissionDeps,
  submitDraft,
} from "./submissions";

/**
 * Checking and submitting many drafts at once (feature 052): 013's `checkSubmission` and
 * `submitDraft` for each, so "ready" means exactly what Submit checks. Each draft is decided on
 * its own, in its own transaction: one that isn't ready doesn't stop the others.
 */

/** The most drafts one check or submit takes. */
export const MAX_BULK = 100;

/** Which drafts: these ids, or all of the person's drafts and submissions sent back for changes. */
export type BulkSelection = { ids: readonly string[] } | { all: true };

export type CheckedDraft =
  | { id: string; result: "ready" | "not_ready"; submission: Submission; issues: ManifestIssue[] }
  | { id: string; result: "not_found" }
  | { id: string; result: "not_submittable"; submission: Submission };

export type SubmittedDraft =
  | {
      id: string;
      result: "submitted" | "resubmitted";
      submission: Submission;
      revision: number;
      issues: ManifestIssue[];
    }
  | { id: string; result: "not_ready"; submission: Submission; issues: ManifestIssue[] }
  | { id: string; result: "not_found" }
  | { id: string; result: "not_submittable"; submission: Submission };

/**
 * The ids a selection means, at most MAX_BULK: `all` is the person's open ones, newest change
 * first, and `more` says how many were left for another run.
 */
const selected = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  selection: BulkSelection,
): Promise<{ ids: string[]; more: number }> => {
  requirePermission(actor.user, "submissions.create");
  if (!("all" in selection)) return { ids: selection.ids.slice(0, MAX_BULK), more: 0 };
  const open = (await deps.repo.listByAuthor(actor.user?.id ?? "")).filter((s) =>
    isEditable(s.status),
  );
  return {
    ids: open.slice(0, MAX_BULK).map((s) => s.id),
    more: Math.max(0, open.length - MAX_BULK),
  };
};

/** The submission behind an id, for the results: the person's own, or null. */
const ownOrNull = async (deps: SubmissionDeps, actor: SubmissionActor, id: string) => {
  const submission = isId(id) ? await deps.repo.find(id) : null;
  return submission && submission.authorId === actor.user?.id ? submission : null;
};

/** What submitting each would say, without submitting anything. */
export const checkMany = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  selection: BulkSelection,
): Promise<{ drafts: CheckedDraft[]; more: number }> => {
  const { ids, more } = await selected(deps, actor, selection);
  const drafts: CheckedDraft[] = [];
  for (const id of ids) {
    const submission = await ownOrNull(deps, actor, id);
    if (!submission) {
      drafts.push({ id, result: "not_found" });
      continue;
    }
    if (!isEditable(submission.status)) {
      drafts.push({ id, result: "not_submittable", submission });
      continue;
    }
    const issues = await checkSubmission(deps, actor, id);
    drafts.push({
      id,
      result: hasErrors(issues) ? "not_ready" : "ready",
      submission,
      issues,
    });
  }
  return { drafts, more };
};

/**
 * Submits each draft that's ready (or resubmits one sent back for changes), in order, each with
 * 013's checks inside its own transaction: a draft that stopped being ready since the check is
 * reported, and the others still go.
 */
export const submitMany = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  selection: BulkSelection,
): Promise<{ results: SubmittedDraft[]; more: number }> => {
  const { ids, more } = await selected(deps, actor, selection);
  const results: SubmittedDraft[] = [];
  for (const id of ids) {
    const before = await ownOrNull(deps, actor, id);
    if (!before) {
      results.push({ id, result: "not_found" });
      continue;
    }
    try {
      const submitted = await submitDraft(deps, actor, id);
      const { issues, revision, ...submission } = submitted;
      results.push({
        id,
        result: before.status === "changes_requested" ? "resubmitted" : "submitted",
        submission,
        revision,
        issues,
      });
    } catch (error) {
      if (error instanceof SubmissionInvalidError)
        results.push({ id, result: "not_ready", submission: before, issues: [...error.issues] });
      else if (error instanceof InvalidStatusTransitionError)
        results.push({ id, result: "not_submittable", submission: before });
      else if (error instanceof SubmissionNotFoundError) results.push({ id, result: "not_found" });
      else throw error;
    }
  }
  return { results, more };
};
