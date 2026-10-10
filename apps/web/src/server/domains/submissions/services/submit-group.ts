import {
  dependenciesFirst,
  formatItemName,
  hasErrors,
  highestMatching,
  type ManifestIssue,
  parseItemName,
  parseManifest,
} from "@ronneai/core";
import { isId } from "../../../db/ids";
import { can } from "../../identity/models/permissions";
import { NotAMemberError } from "../exceptions/errors";
import { isEditable, OPEN_STATUSES } from "../models/status";
import { fileBytes, itemNameOf, MANIFEST_PATH, type Submission } from "../models/submission";
import type { NamedSubmission, RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { dependenciesOf } from "./dependency-marks";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/**
 * Submitting together (feature 112): an item goes for review with every one of the person's own
 * drafts it needs, directly or through others, cycles included, all or none. A group is what goes
 * in one step; the drafts of a selection that share a dependency are one group.
 */

/** A group: its ids, dependencies first (a cycle's next to each other), and why each is in it. */
export type SubmitGroup = {
  ids: string[];
  /** Each draft brought in by another: the names of the items that need it. */
  neededBy: Map<string, string[]>;
  /** Each draft's own dependency drafts in the group, by id. */
  needs: Map<string, string[]>;
};

/** The most drafts one group sends: as many as one bulk submit takes (052). */
export const MAX_GROUP = 100;

/**
 * What a submission depends on as it would be sent: its saved `ronne.yaml` while it's with its
 * author (a draft, or sent back for changes and edited since), its latest revision otherwise.
 */
const sentDependencies = async (repo: SubmissionRepository, submission: Submission) => {
  if (!isEditable(submission.status)) return dependenciesOf(repo, submission);
  const manifest = (await repo.files(submission.id)).find((file) => file.path === MANIFEST_PATH);
  const parsed = manifest
    ? parseManifest(new TextDecoder().decode(fileBytes(manifest))).manifest
    : null;
  return (parsed?.dependencies ?? {}) as Record<string, string>;
};

/**
 * Whether a dependency still has to go with what needs it: nothing released matches its range,
 * and none of the person's own submissions of it is on its way already (056).
 */
const stillNeeded = async (
  registry: RegistryLookup,
  actor: SubmissionActor,
  name: string,
  range: string,
) => {
  const parsed = parseItemName(name);
  if (!parsed) return false;
  const item = await registry.findItem(parsed);
  if (item) {
    const versions = (await registry.publishedVersions(item.id)).filter((v) => !v.yanked);
    if (
      highestMatching(
        versions.map((v) => v.version),
        range,
      )
    )
      return false;
  }
  return !(await registry.submissionsNamed(parsed)).some(
    (s) => s.authorId === actor.user?.id && OPEN_STATUSES.includes(s.status),
  );
};

/**
 * The person's drafts (not yet submitted) by item name: the newest one of each name, a change
 * proposal (017) first, since a new item's draft of a published name can never go.
 */
export const ownDraftsByName = async (repo: SubmissionRepository, actor: SubmissionActor) => {
  const byName = new Map<string, Submission>();
  for (const submission of await repo.listByAuthor(actor.user?.id ?? "")) {
    if (submission.status !== "draft") continue;
    const known = byName.get(itemNameOf(submission));
    if (!known || (known.proposal === null && submission.proposal !== null))
      byName.set(itemNameOf(submission), submission);
  }
  return byName;
};

/**
 * The groups a selection makes. With `dependencies` (the default), each selected draft brings the
 * person's own drafts it needs, through the chain: a draft of a dependency nothing released or on
 * its way already meets. Without it, only the selection's own links join them. Groups come in the
 * order their first id was selected.
 */
export const submitGroups = async (
  repo: SubmissionRepository,
  actor: SubmissionActor,
  ids: readonly string[],
  { dependencies = true }: { dependencies?: boolean } = {},
): Promise<SubmitGroup[]> => {
  const byName = await ownDraftsByName(repo, actor);
  const registry = repo.registry();
  const selected = new Set(ids);
  const seen: string[] = [];
  const links = new Map<string, string[]>();
  const neededBy = new Map<string, string[]>();
  // A name a selected draft has resolves to it, not to a newer draft of the same name.
  const chosen = new Map<string, Submission>();
  for (const id of ids) {
    const submission = isId(id) ? await repo.find(id) : null;
    if (submission?.status === "draft" && submission.authorId === actor.user?.id)
      chosen.set(itemNameOf(submission), chosen.get(itemNameOf(submission)) ?? submission);
  }
  const pending = [...ids];
  for (let id = pending.shift(); id !== undefined; id = pending.shift()) {
    if (seen.includes(id)) continue;
    seen.push(id);
    const submission = isId(id) ? await repo.find(id) : null;
    if (!submission || submission.authorId !== actor.user?.id || !isEditable(submission.status))
      continue;
    for (const [name, range] of Object.entries(await sentDependencies(repo, submission))) {
      const dependency = chosen.get(name) ?? byName.get(name);
      if (!dependency || dependency.id === id) continue;
      if (!dependencies && !selected.has(dependency.id)) continue;
      // Met already (released, or on its way): it doesn't go with this one, selected or not.
      if (!(await stillNeeded(registry, actor, name, range))) continue;
      links.set(id, [...(links.get(id) ?? []), dependency.id]);
      if (!selected.has(dependency.id))
        neededBy.set(dependency.id, [
          ...(neededBy.get(dependency.id) ?? []),
          itemNameOf(submission),
        ]);
      pending.push(dependency.id);
    }
  }

  // Joined by any link, either way: one group.
  const root = new Map(seen.map((id) => [id, id]));
  const find = (id: string): string => {
    let at = id;
    while (root.get(at) !== at) at = root.get(at) ?? at;
    return at;
  };
  for (const [id, to] of links) for (const other of to) root.set(find(other), find(id));
  const members = new Map<string, string[]>();
  for (const id of seen) members.set(find(id), [...(members.get(find(id)) ?? []), id]);

  return [...members.values()].map((group) => {
    const { order } = dependenciesFirst(
      group.map((id) => ({ name: id, dependsOn: links.get(id) ?? [] })),
    );
    const inGroup = new Set(group);
    return {
      ids: order,
      neededBy: new Map([...neededBy].filter(([id]) => inGroup.has(id))),
      needs: new Map([...links].filter(([id]) => inGroup.has(id))),
    };
  });
};

/**
 * A registry where the group's drafts are already in review: what each member's checks will find
 * once they all are (056, 112).
 */
export const withIncoming = (
  registry: RegistryLookup,
  incoming: ReadonlyMap<string, NamedSubmission>,
): RegistryLookup => ({
  ...registry,
  submissionsNamed: async (ref) => {
    const coming = incoming.get(formatItemName(ref));
    const known = await registry.submissionsNamed(ref);
    return coming ? [coming, ...known] : known;
  },
});

/** How a group's drafts look once submitted, by name, for each other's checks. */
export const incomingOf = async (
  repo: SubmissionRepository,
  registry: RegistryLookup,
  submissions: readonly Submission[],
): Promise<Map<string, NamedSubmission>> => {
  const incoming = new Map<string, NamedSubmission>();
  for (const submission of submissions)
    if (submission.status === "draft")
      incoming.set(itemNameOf(submission), {
        id: submission.id,
        status: "submitted",
        type: submission.type,
        authorId: submission.authorId,
        proposal: submission.proposal !== null,
        dependencies: await dependenciesOf(repo, submission),
        workspace: {
          id: submission.workspace.id,
          private: (await registry.privateWorkspaces([submission.workspace.id])).has(
            submission.workspace.id,
          ),
        },
      });
  return incoming;
};

/** A group member as checked: what can be sent, or why not. */
export type CheckedMember =
  | { id: string; result: "ready" | "not_ready"; submission: Submission; issues: ManifestIssue[] }
  | { id: string; result: "not_found" }
  | { id: string; result: "not_submittable"; submission: Submission }
  | { id: string; result: "not_a_member"; submission: Submission; issues: ManifestIssue[] };

/** A member that can't go, for the others: why their group waits, by what stops it. */
const blockedBy = (member: CheckedMember): ManifestIssue => {
  const name = "submission" in member ? itemNameOf(member.submission) : "A draft it needs";
  return {
    severity: "error",
    code: "group_member_not_ready",
    message:
      member.result === "not_found"
        ? `${name} isn't one of your drafts any more: check again.`
        : member.result === "not_submittable"
          ? `${name} was submitted or changed meanwhile: check again.`
          : member.result === "not_a_member"
            ? `${name} is in a workspace you can't submit to.`
            : `${name} isn't ready: fix its errors first.`,
    file: MANIFEST_PATH,
    path: "/dependencies",
  };
};

/**
 * Each member's checks as if the whole group were in review (`allIssues`, given by the caller so
 * it runs on the caller's connection). A group is ready only when every member is: a member that
 * isn't makes each of the others say so, with its name.
 */
export const checkGroup = async (
  deps: SubmissionDeps,
  repo: SubmissionRepository,
  actor: SubmissionActor,
  ids: readonly string[],
  check: (
    deps: SubmissionDeps,
    repo: SubmissionRepository,
    submission: Submission,
  ) => Promise<ManifestIssue[]>,
): Promise<{ ready: boolean; members: CheckedMember[] }> => {
  const found = await Promise.all(
    ids.map(async (id) => ({ id, submission: isId(id) ? await repo.find(id) : null })),
  );
  const registry = deps.registry ?? repo.registry();
  // Only what can be sent counts as on its way for the others.
  const incoming = await incomingOf(
    repo,
    registry,
    found.flatMap(({ submission }) =>
      submission &&
      submission.authorId === actor.user?.id &&
      can(actor.user, "submissions.create", submission.workspace.id)
        ? [submission]
        : [],
    ),
  );
  const tooMany: ManifestIssue[] =
    ids.length > MAX_GROUP
      ? [
          {
            severity: "error",
            code: "group_too_large",
            message: `It goes with ${ids.length - 1} of your drafts, more than ${MAX_GROUP - 1} at once: submit some of what it needs first.`,
          },
        ]
      : [];
  const names = new Set<string>();
  const together = { ...deps, registry: withIncoming(registry, incoming) };
  const members: CheckedMember[] = [];
  for (const { id, submission } of found) {
    if (!submission || submission.authorId !== actor.user?.id) {
      members.push({ id, result: "not_found" });
      continue;
    }
    if (!isEditable(submission.status)) {
      members.push({ id, result: "not_submittable", submission });
      continue;
    }
    if (!can(actor.user, "submissions.create", submission.workspace.id)) {
      members.push({
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
      continue;
    }
    // Two drafts of one new item's name can't both go for review (the name check counts open
    // ones only). Change proposals of one item can (017).
    const name = itemNameOf(submission);
    const twice: ManifestIssue[] =
      submission.proposal === null && names.has(name)
        ? [
            {
              severity: "error",
              code: "name_taken",
              message: `${name} is in this group twice: submit one of its drafts.`,
              path: "/name",
            },
          ]
        : [];
    if (submission.proposal === null) names.add(name);
    const issues = [...(await check(together, repo, submission)), ...twice, ...tooMany];
    members.push({
      id,
      result: hasErrors(issues) ? "not_ready" : "ready",
      submission,
      issues,
    });
  }
  const blockers = members.filter((member) => member.result !== "ready");
  if (blockers.length === 0) return { ready: true, members };
  return {
    ready: false,
    members: members.map((member) =>
      member.result === "ready"
        ? {
            ...member,
            result: "not_ready",
            issues: [...member.issues, ...blockers.map(blockedBy)],
          }
        : member,
    ),
  };
};
