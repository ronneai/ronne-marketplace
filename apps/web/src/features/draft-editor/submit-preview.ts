import type { ManifestIssue } from "@ronneai/core";
import { itemNameOf, type Submission } from "@/server/domains/submissions/models/submission";
import type { GroupMember, SubmitPreview } from "./types";

/** A group as the service checks it (112), in the shape the action receives. */
type CheckedGroup = {
  members: (
    | { id: string; result: "ready" | "not_ready"; submission: Submission; issues: ManifestIssue[] }
    | { id: string; result: "not_found" }
    | { id: string; result: "not_submittable"; submission: Submission }
    | { id: string; result: "not_a_member"; submission: Submission; issues: ManifestIssue[] }
  )[];
  neededBy: ReadonlyMap<string, string[]>;
  cycles: readonly string[][];
};

/**
 * What the Submit dialog shows for item `id` (112): its own checks, and the person's drafts that
 * go with it, dependencies first, each with what needs it and whether it's in a cycle.
 */
export const toPreview = (id: string, group: CheckedGroup): SubmitPreview => {
  const inCycle = new Set(group.cycles.flat());
  const item = group.members.find((member) => member.id === id);
  const members: GroupMember[] = group.members.flatMap((member) =>
    member.id !== id && "submission" in member
      ? [
          {
            id: member.id,
            name: itemNameOf(member.submission),
            neededBy: group.neededBy.get(member.id) ?? [],
            inCycle: inCycle.has(member.id),
            ready: member.result === "ready",
            issues: "issues" in member ? member.issues : [],
          },
        ]
      : [],
  );
  return {
    ok: true,
    issues: item && "issues" in item ? item.issues : [],
    inCycle: inCycle.has(id),
    members,
  };
};
