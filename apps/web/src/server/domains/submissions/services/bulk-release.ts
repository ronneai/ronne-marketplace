import { IdentityError } from "../../identity/exceptions/errors";
import { SubmissionsError } from "../exceptions/errors";
import { type PlannedRelease, planReleases, type ReleaseSettings } from "../models/release-plan";
import { type PublishDeps, releaseTogether } from "./publish";
import {
  MAX_BULK_RELEASE,
  type PreparedRelease,
  prepareRelease,
  type ReleaseCandidate,
  type ReleasedSubmission,
} from "./release-group";
import type { SubmissionActor } from "./submissions";

export {
  MAX_BULK_RELEASE,
  type PreparedRelease,
  prepareRelease,
  type ReleaseCandidate,
  type ReleasedSubmission,
};

/**
 * Releasing many at once (feature 055): the selection, with the approved dependencies each needs
 * that aren't released yet (056), in groups (112). A group is everything joined by a dependency in
 * the batch, cycles included; each goes out with `releaseTogether`, in one transaction, all or
 * none. A group that fails stops only itself.
 */

/** The candidates in groups: joined by any dependency in the batch, in release order. */
const groupsOf = (candidates: readonly ReleaseCandidate[]): ReleaseCandidate[][] => {
  const byName = new Map(candidates.map((c) => [c.name, c]));
  const root = new Map(candidates.map((c) => [c.id, c.id]));
  const find = (id: string): string => {
    let at = id;
    while (root.get(at) !== at) at = root.get(at) ?? at;
    return at;
  };
  for (const candidate of candidates)
    for (const name of candidate.dependsOn) {
      const other = byName.get(name);
      if (other) root.set(find(other.id), find(candidate.id));
    }
  const groups = new Map<string, ReleaseCandidate[]>();
  for (const candidate of candidates)
    groups.set(find(candidate.id), [...(groups.get(find(candidate.id)) ?? []), candidate]);
  return [...groups.values()];
};

/**
 * Releases the selection with one set of settings: each version and tag from `planReleases`, then
 * each group with `releaseTogether`. A group that can't be planned or released is
 * `not_releasable` for each of its members, with why. Each release is audited as 015's, with
 * `via: "bulk"`.
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
  for (const group of groupsOf(candidates)) {
    const refuse = (reasonFor: (candidate: ReleaseCandidate) => string) => {
      for (const candidate of group)
        results.push({
          id: candidate.id,
          name: candidate.name,
          result: "not_releasable",
          reason: reasonFor(candidate),
        });
    };
    const names = (except: ReleaseCandidate) =>
      group
        .filter((c) => c !== except)
        .map((c) => c.name)
        .join(", ");
    if (group.length > MAX_BULK_RELEASE) {
      refuse(
        () =>
          `It goes with ${group.length - 1} others, more than ${MAX_BULK_RELEASE - 1} at once: release some of them first.`,
      );
      continue;
    }
    const unplanned = group.find((c) => !plans.get(c.id)?.ok);
    if (unplanned) {
      const plan = plans.get(unplanned.id);
      const problem = plan && !plan.ok ? plan.problem : "It couldn't be planned.";
      refuse((c) =>
        c === unplanned ? problem : `It goes with ${unplanned.name}, which can't go: ${problem}`,
      );
      continue;
    }
    try {
      const released = await releaseTogether(
        deps,
        actor,
        group.map((c) => {
          const plan = plans.get(c.id);
          return plan?.ok
            ? { id: c.id, choice: plan.choice, tag: plan.tag }
            : { id: c.id, choice: { kind: "stable", bump: "minor" } };
        }),
        { notes: input.notes, via: "bulk" },
      );
      for (const member of released)
        results.push({
          id: member.id,
          name: member.name,
          result: "published",
          version: member.version,
          tag: member.tag,
          sha256: member.sha256,
        });
    } catch (error) {
      const reason =
        error instanceof SubmissionsError || error instanceof IdentityError
          ? error.message
          : `It couldn't be stored or recorded: ${error instanceof Error ? error.message : String(error)}`;
      refuse((c) =>
        group.length === 1 ? reason : `${reason} (released together with ${names(c)}: none went.)`,
      );
    }
  }
  return results;
};
