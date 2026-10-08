import type { ManifestIssue } from "@ronneai/core";
import { isId } from "../../../db/ids";
import { isEditable } from "../models/status";
import type { Submission } from "../models/submission";
import { requireSignedIn } from "./membership";
import { allIssues, type SubmissionActor, type SubmissionDeps, sendGroup } from "./submissions";
import { type CheckedMember, checkGroup, type SubmitGroup, submitGroups } from "./submit-group";

/**
 * Checking and submitting many drafts at once (feature 052), with 013's checks, so "ready" means
 * exactly what Submit checks.
 *
 * Since 056, a draft's dependencies that are the person's own drafts too are included, unless
 * `dependencies: false`; each included one says which drafts it was included for. Since 112 they
 * go in groups (`submit-group.ts`): a draft with the drafts it needs, all or none, each group in
 * its own transaction, so one that isn't ready doesn't stop the others.
 */

/** The most drafts one check or submit takes. */
export const MAX_BULK = 100;

/**
 * Which drafts: these ids, or all of the person's drafts and submissions sent back for changes;
 * with their own dependency drafts too unless `dependencies: false` (056).
 */
export type BulkSelection = ({ ids: readonly string[] } | { all: true }) & {
  dependencies?: boolean;
};

/**
 * For a dependency included with its dependents (056): their names. And for a dependent, the ids
 * of its own dependency drafts, selected or not: My submissions selects them with it.
 */
type Included = { includedFor?: string[]; needs?: string[] };

export type CheckedDraft = Included &
  (
    | { id: string; result: "ready" | "not_ready"; submission: Submission; issues: ManifestIssue[] }
    | { id: string; result: "not_found" }
    | { id: string; result: "not_submittable"; submission: Submission }
    | NotAMember
  );

/**
 * A draft in a workspace the person isn't a member of (any more): skipped, with the reason as its
 * one issue, so every client shows it as it shows a check that failed (091).
 */
type NotAMember = {
  id: string;
  result: "not_a_member";
  submission: Submission;
  issues: ManifestIssue[];
};

export type SubmittedDraft = Included &
  (
    | {
        id: string;
        result: "submitted" | "resubmitted";
        submission: Submission;
        revision: number;
        issues: ManifestIssue[];
      }
    | { id: string; result: "not_ready"; submission: Submission; issues: ManifestIssue[] }
    | { id: string; result: "not_found" }
    | { id: string; result: "not_submittable"; submission: Submission }
    | NotAMember
  );

/**
 * The ids a selection means, at most MAX_BULK: `all` is the person's open ones, newest change
 * first, and `more` says how many were left for another run.
 */
const selected = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  selection: BulkSelection,
): Promise<{ ids: string[]; more: number }> => {
  requireSignedIn(actor);
  if (!("all" in selection)) return { ids: selection.ids.slice(0, MAX_BULK), more: 0 };
  const open = (await deps.repo.listByAuthor(actor.user?.id ?? "")).filter((s) =>
    isEditable(s.status),
  );
  return {
    ids: open.slice(0, MAX_BULK).map((s) => s.id),
    more: Math.max(0, open.length - MAX_BULK),
  };
};

/** A member's outcome as the bulk results say it, with why it's in the batch. */
const outcome = (member: CheckedMember, included: Included): CheckedDraft => ({
  ...member,
  ...included,
});

/** Why each id is in the batch: brought in for others, and the drafts it brings (056, 112). */
const includedOf = (group: SubmitGroup, id: string): Included => ({
  ...(group.neededBy.has(id) ? { includedFor: group.neededBy.get(id) } : {}),
  ...(group.needs.has(id) ? { needs: group.needs.get(id) } : {}),
});

/**
 * What submitting each would say, without submitting anything: in groups (112), each checked as
 * if all its drafts were in review, ready only when every one of them is.
 */
export const checkMany = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  selection: BulkSelection,
): Promise<{ drafts: CheckedDraft[]; more: number }> => {
  const picked = await selected(deps, actor, selection);
  const groups = await submitGroups(deps.repo, actor, picked.ids, {
    dependencies: selection.dependencies !== false,
  });
  const drafts: CheckedDraft[] = [];
  for (const group of groups) {
    const { members } = await checkGroup(deps, deps.repo, actor, group.ids, (d, repo, s) =>
      allIssues(d, repo, s),
    );
    for (const member of members) drafts.push(outcome(member, includedOf(group, member.id)));
  }
  return { drafts, more: picked.more };
};

/**
 * Submits the selection in groups (112): each group in one transaction, every draft in it or
 * none, a group that isn't ready reported per draft, and the others still go.
 */
export const submitMany = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  selection: BulkSelection,
): Promise<{ results: SubmittedDraft[]; more: number }> => {
  const picked = await selected(deps, actor, selection);
  const groups = await submitGroups(deps.repo, actor, picked.ids, {
    dependencies: selection.dependencies !== false,
  });
  const results: SubmittedDraft[] = [];
  for (const group of groups) {
    const at = (deps.now ?? (() => new Date()))();
    const before = new Map<string, Submission | null>();
    for (const id of group.ids) before.set(id, isId(id) ? await deps.repo.find(id) : null);
    const sent = await deps.repo.transaction((repo) =>
      sendGroup(deps, repo, actor, group.ids, at, new Set(picked.ids)),
    );
    if (!sent.ok) {
      for (const member of sent.members)
        results.push(outcome(member, includedOf(group, member.id)) as SubmittedDraft);
      continue;
    }
    for (const member of sent.sent) {
      const { issues, revision, ...submission } = member;
      results.push({
        id: member.id,
        result: before.get(member.id)?.status === "changes_requested" ? "resubmitted" : "submitted",
        submission,
        revision,
        issues,
        ...includedOf(group, member.id),
      });
    }
  }
  return { results, more: picked.more };
};
