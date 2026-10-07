import { type Bump, dependenciesFirst, parseItemName } from "@ronneai/core";
import { isId } from "../../../db/ids";
import { IdentityError } from "../../identity/exceptions/errors";
import { can } from "../../identity/models/permissions";
import { BulkLimitError, NotAMemberError, SubmissionsError } from "../exceptions/errors";
import { type PlannedRelease, planReleases, type ReleaseSettings } from "../models/release-plan";
import { statusLabel } from "../models/status";
import { itemNameOf, type Submission } from "../models/submission";
import { dependenciesOf, marksFor } from "./dependency-marks";
import { requireSignedIn } from "./membership";
import { staleVersion } from "./proposals";
import { type PublishDeps, publishSubmission } from "./publish";
import { suggestedBumpOf } from "./review-page";
import type { SubmissionActor } from "./submissions";

/**
 * Releasing many at once (feature 055): 015's `publishSubmission` for each approved submission,
 * dependencies first, each with its own pack, stored artifact and transaction. Selecting one also
 * takes its approved dependencies that aren't released yet (056), when the person may release them.
 * One that fails stops only itself and what depends on it in the batch.
 */

/** The most submissions one request releases: each packs and stores an artifact. */
export const MAX_BULK_RELEASE = 50;

/** A submission that can go out in this batch, with what the plan needs. */
export type ReleaseCandidate = {
  id: string;
  name: string;
  type: Submission["type"];
  author: string;
  /** The item's versions so far, yanked ones included; empty for a first release. */
  published: string[];
  suggested: Bump | null;
  /** Its dependencies in this batch, by name: released before it. */
  dependsOn: string[];
  /** Added for these selected ones, as their dependency (056). */
  includedFor?: string[];
};

export type ReleasedSubmission =
  | { id: string; name: string; result: "published"; version: string; tag: string; sha256: string }
  | { id: string; name: string | null; result: "not_found" }
  | { id: string; name: string; result: "not_releasable" | "skipped"; reason: string };

export type PreparedRelease = {
  /** In release order, dependencies first. */
  candidates: ReleaseCandidate[];
  /** The ones that can't go, and why. */
  refused: ReleasedSubmission[];
};

/**
 * Why the actor can't release it, or null: its workspace's moderators and root release any, the
 * author their own while a member of its workspace (091).
 */
const releaseRefusal = (actor: SubmissionActor, submission: Submission): string | null => {
  if (can(actor.user, "submissions.publish", submission.workspace.id)) return null;
  if (submission.authorId === actor.user?.id)
    return can(actor.user, "submissions.create", submission.workspace.id)
      ? null
      : new NotAMemberError(submission.workspace.name, "release your items there").message;
  return "Only its author, a moderator or root releases it.";
};

/**
 * What releasing these would do: the candidates in order, with their approved dependencies added,
 * and the ones refused with their reason. Nothing is released; the dialog's preview and
 * `releaseMany` both start here.
 */
export const prepareRelease = async (
  deps: PublishDeps,
  actor: SubmissionActor,
  input: { ids: readonly string[] },
): Promise<PreparedRelease> => {
  requireSignedIn(actor);
  const ids = [...new Set(input.ids)];
  if (ids.length > MAX_BULK_RELEASE) throw new BulkLimitError(ids.length, MAX_BULK_RELEASE);
  const registry = deps.registry ?? deps.repo.registry();
  const refused: ReleasedSubmission[] = [];
  const chosen = new Map<string, { submission: Submission; includedFor?: string[] }>();
  const names = new Map<string, string>(); // item name → submission id in the batch

  /** Why `submission` can't go now, or null. */
  const problemOf = async (submission: Submission): Promise<string | null> => {
    if (submission.status !== "approved")
      return `It's ${statusLabel(submission.status)}, not approved.`;
    const refusal = releaseRefusal(actor, submission);
    if (refusal) return refusal;
    const newer = await staleVersion(registry, submission);
    if (newer) return `Rebase needed: ${newer} has been released since it was approved.`;
    return null;
  };

  /** Adds a submission, then its approved dependencies that aren't released yet. */
  const add = async (submission: Submission, includedFor?: string): Promise<string | null> => {
    const name = itemNameOf(submission);
    const known = chosen.get(submission.id);
    if (known) {
      if (includedFor && known.includedFor)
        known.includedFor = [...new Set([...known.includedFor, includedFor])];
      return null;
    }
    const problem = await problemOf(submission);
    if (problem) return problem;
    chosen.set(submission.id, {
      submission,
      ...(includedFor ? { includedFor: [includedFor] } : {}),
    });
    names.set(name, submission.id);
    for (const [dependency, range] of Object.entries(await dependenciesOf(deps.repo, submission))) {
      if ((await marksFor(registry, { [dependency]: range })).length === 0) continue;
      const parsed = parseItemName(dependency);
      const open = parsed ? await registry.submissionsNamed(parsed.scope, parsed.name) : [];
      const approved = open.find((s) => s.status === "approved");
      const waiting = open.find(
        (s) => s.status === "submitted" || s.status === "changes_requested",
      );
      const reason = approved
        ? null
        : waiting
          ? `It waits on ${dependency}, which is ${statusLabel(waiting.status)}.`
          : `It waits on ${dependency}, which isn't on its way to a release.`;
      const found = approved ? await deps.repo.find(approved.id) : null;
      const why =
        reason ??
        (found ? await add(found, name) : `It waits on ${dependency}, which couldn't be found.`);
      if (why) {
        chosen.delete(submission.id);
        names.delete(name);
        return reason ?? `${dependency} can't be released with it: ${why}`;
      }
    }
    return null;
  };

  for (const id of ids) {
    const submission = isId(id) ? await deps.repo.find(id) : null;
    const visible =
      submission &&
      (submission.authorId === actor.user?.id ||
        (submission.status !== "draft" &&
          can(actor.user, "submissions.view_submitted", submission.workspace.id)));
    if (!submission || !visible) {
      refused.push({ id, name: null, result: "not_found" });
      continue;
    }
    const problem = await add(submission);
    if (problem)
      refused.push({
        id,
        name: itemNameOf(submission),
        result: "not_releasable",
        reason: problem,
      });
  }

  // Each candidate's facts, then the order: what it depends on in the batch goes first.
  const facts = await Promise.all(
    [...chosen.values()].map(async ({ submission, includedFor }) => {
      const item = await registry.findItem(submission.scope.name, submission.name);
      const dependencies = Object.keys(await dependenciesOf(deps.repo, submission));
      return {
        id: submission.id,
        name: itemNameOf(submission),
        type: submission.type,
        author: (await deps.repo.userName(submission.authorId)) ?? "A former user",
        published: item ? (await registry.publishedVersions(item.id)).map((v) => v.version) : [],
        suggested: await suggestedBumpOf(deps, submission),
        dependsOn: dependencies.filter((dependency) => names.has(dependency)),
        ...(includedFor ? { includedFor } : {}),
      } satisfies ReleaseCandidate;
    }),
  );
  const { order, cycle } = dependenciesFirst(facts);
  if (cycle)
    return {
      candidates: [],
      refused: [
        ...refused,
        ...facts.map((f) => ({
          id: f.id,
          name: f.name,
          result: "not_releasable" as const,
          reason: `The dependencies go round in a circle: ${cycle.join(" → ")}.`,
        })),
      ],
    };
  return {
    candidates: order.flatMap((name) => facts.filter((f) => f.name === name)),
    refused,
  };
};

/**
 * Releases the selection with one set of settings: each version and tag from `planReleases`, then
 * 015's publish for each, in order. A dependent whose dependency in the batch didn't go out is
 * `skipped`; anything else that fails is `not_releasable`, with why. Each release is audited as
 * 015's, with `via: "bulk"`.
 */
export const releaseMany = async (
  deps: PublishDeps,
  actor: SubmissionActor,
  input: { ids: readonly string[]; settings: ReleaseSettings; notes?: string },
): Promise<ReleasedSubmission[]> => {
  const { candidates, refused } = await prepareRelease(deps, actor, input);
  const plans = new Map<string, PlannedRelease>(
    planReleases(candidates, input.settings).map((plan) => [plan.id, plan]),
  );
  const results: ReleasedSubmission[] = [...refused];
  const failed = new Set<string>();
  for (const candidate of candidates) {
    const plan = plans.get(candidate.id);
    const blocker = candidate.dependsOn.find((name) => failed.has(name));
    if (blocker) {
      failed.add(candidate.name);
      results.push({
        id: candidate.id,
        name: candidate.name,
        result: "skipped",
        reason: `${blocker} wasn't released, and it depends on it.`,
      });
      continue;
    }
    if (!plan?.ok) {
      failed.add(candidate.name);
      results.push({
        id: candidate.id,
        name: candidate.name,
        result: "not_releasable",
        reason: plan?.problem ?? "It couldn't be planned.",
      });
      continue;
    }
    try {
      const published = await publishSubmission(deps, actor, candidate.id, {
        choice: plan.choice,
        tag: plan.tag,
        notes: input.notes,
        via: "bulk",
      });
      results.push({
        id: candidate.id,
        name: candidate.name,
        result: "published",
        version: published.version,
        tag: published.tag,
        sha256: published.sha256,
      });
    } catch (error) {
      failed.add(candidate.name);
      results.push({
        id: candidate.id,
        name: candidate.name,
        result: "not_releasable",
        reason:
          error instanceof SubmissionsError || error instanceof IdentityError
            ? error.message
            : `It couldn't be stored or recorded: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return results;
};
