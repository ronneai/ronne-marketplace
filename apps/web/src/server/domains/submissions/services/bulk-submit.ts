import { hasErrors, type ManifestIssue } from "@ronneai/core";
import { isId } from "../../../db/ids";
import { can } from "../../identity/models/permissions";
import {
  InvalidStatusTransitionError,
  NotAMemberError,
  SubmissionInvalidError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import { isEditable } from "../models/status";
import { itemNameOf, type Submission } from "../models/submission";
import type { NamedSubmission, RegistryLookup } from "../repositories/registry-lookup";
import { dependenciesOf } from "./dependency-marks";
import { requireSignedIn } from "./membership";
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
 *
 * Since 056, a draft's dependencies that are the person's own drafts too are included, before it,
 * unless `dependencies: false`: once submitted they're in review, which is all its own submit
 * needs. Each included one says which drafts it was included for.
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

const notAMember = (id: string, submission: Submission): NotAMember => ({
  id,
  result: "not_a_member",
  submission,
  issues: [
    {
      severity: "error",
      code: "not_a_member",
      message: new NotAMemberError(submission.workspace.name).message,
    },
  ],
});

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

/** The person's drafts (not yet submitted) by item name: the newest one of each name. */
const ownDraftsByName = async (deps: SubmissionDeps, actor: SubmissionActor) => {
  const byName = new Map<string, Submission>();
  for (const submission of await deps.repo.listByAuthor(actor.user?.id ?? ""))
    if (submission.status === "draft" && !byName.has(itemNameOf(submission)))
      byName.set(itemNameOf(submission), submission);
  return byName;
};

/**
 * The selection with each draft's own dependency drafts before it, depth first, and who each
 * included one is for. A draft already selected moves ahead of what depends on it.
 */
const withDependencies = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  ids: readonly string[],
): Promise<{ ids: string[]; includedFor: Map<string, string[]>; needs: Map<string, string[]> }> => {
  const byName = await ownDraftsByName(deps, actor);
  const selected = new Set(ids);
  const order: string[] = [];
  const includedFor = new Map<string, string[]>();
  const needs = new Map<string, string[]>();
  const visiting = new Set<string>();
  const visit = async (id: string) => {
    if (order.includes(id) || visiting.has(id)) return;
    visiting.add(id);
    const submission = isId(id) ? await deps.repo.find(id) : null;
    if (submission && submission.authorId === actor.user?.id && isEditable(submission.status))
      for (const name of Object.keys(await dependenciesOf(deps.repo, submission))) {
        const dependency = byName.get(name);
        if (!dependency) continue;
        needs.set(id, [...(needs.get(id) ?? []), dependency.id]);
        if (!selected.has(dependency.id))
          includedFor.set(dependency.id, [
            ...(includedFor.get(dependency.id) ?? []),
            itemNameOf(submission),
          ]);
        await visit(dependency.id);
      }
    visiting.delete(id);
    order.push(id);
  };
  for (const id of ids) await visit(id);
  return { ids: order, includedFor, needs };
};

/**
 * A registry where the drafts about to be submitted first are already in review: what the
 * dependents' checks will find once they are (056).
 */
const withIncoming = (
  registry: RegistryLookup,
  incoming: ReadonlyMap<string, NamedSubmission>,
): RegistryLookup => ({
  ...registry,
  submissionsNamed: async (scope, name) => {
    const coming = incoming.get(`@${scope}/${name}`);
    const known = await registry.submissionsNamed(scope, name);
    return coming ? [coming, ...known] : known;
  },
});

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
  const picked = await selected(deps, actor, selection);
  const { ids, includedFor, needs } =
    selection.dependencies === false
      ? {
          ids: picked.ids,
          includedFor: new Map<string, string[]>(),
          needs: new Map<string, string[]>(),
        }
      : await withDependencies(deps, actor, picked.ids);
  const registry = deps.registry ?? deps.repo.registry();
  // Ready drafts earlier in the order will be in review when the later ones are submitted.
  const incoming = new Map<string, NamedSubmission>();
  const drafts: CheckedDraft[] = [];
  for (const id of ids) {
    const included = {
      ...(includedFor.has(id) ? { includedFor: includedFor.get(id) } : {}),
      ...(needs.has(id) ? { needs: needs.get(id) } : {}),
    };
    const submission = await ownOrNull(deps, actor, id);
    if (!submission) {
      drafts.push({ id, result: "not_found", ...included });
      continue;
    }
    if (!isEditable(submission.status)) {
      drafts.push({ id, result: "not_submittable", submission, ...included });
      continue;
    }
    if (!can(actor.user, "submissions.create", submission.workspace.id)) {
      drafts.push({ ...notAMember(id, submission), ...included });
      continue;
    }
    const issues = await checkSubmission(
      { ...deps, registry: withIncoming(registry, incoming) },
      actor,
      id,
    );
    const ready = !hasErrors(issues);
    if (ready && submission.status === "draft")
      incoming.set(itemNameOf(submission), {
        id: submission.id,
        status: "submitted",
        type: submission.type,
        authorId: submission.authorId,
        proposal: submission.proposal !== null,
        dependencies: await dependenciesOf(deps.repo, submission),
        workspace: {
          id: submission.workspace.id,
          private: (await registry.privateWorkspaces([submission.workspace.id])).has(
            submission.workspace.id,
          ),
        },
      });
    drafts.push({
      id,
      result: ready ? "ready" : "not_ready",
      submission,
      issues,
      ...included,
    });
  }
  return { drafts, more: picked.more };
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
  const picked = await selected(deps, actor, selection);
  // Dependencies first: once each is in review, what depends on it can be submitted (056).
  const { ids, includedFor, needs } =
    selection.dependencies === false
      ? {
          ids: picked.ids,
          includedFor: new Map<string, string[]>(),
          needs: new Map<string, string[]>(),
        }
      : await withDependencies(deps, actor, picked.ids);
  const more = picked.more;
  const results: SubmittedDraft[] = [];
  for (const id of ids) {
    const included = {
      ...(includedFor.has(id) ? { includedFor: includedFor.get(id) } : {}),
      ...(needs.has(id) ? { needs: needs.get(id) } : {}),
    };
    const before = await ownOrNull(deps, actor, id);
    if (!before) {
      results.push({ id, result: "not_found", ...included });
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
        ...included,
      });
    } catch (error) {
      if (error instanceof SubmissionInvalidError)
        results.push({
          id,
          result: "not_ready",
          submission: before,
          issues: [...error.issues],
          ...included,
        });
      else if (error instanceof InvalidStatusTransitionError)
        results.push({ id, result: "not_submittable", submission: before, ...included });
      else if (error instanceof SubmissionNotFoundError)
        results.push({ id, result: "not_found", ...included });
      else if (error instanceof NotAMemberError)
        results.push({ ...notAMember(id, before), ...included });
      else throw error;
    }
  }
  return { results, more };
};
