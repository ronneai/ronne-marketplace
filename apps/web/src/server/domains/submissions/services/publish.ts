import { createHash } from "node:crypto";
import {
  canonicalItemName,
  DEFAULT_LIMITS,
  defaultTag,
  formatItemName,
  GLOBAL_WORKSPACE,
  hasErrors,
  highestMatching,
  type Manifest,
  nextVersion,
  parseItemName,
  parseManifest,
  type ReleaseChoice,
  riskFlags,
  tagProblem,
} from "@ronneai/core";
import { PackError, packItem } from "@ronneai/core/pack";
import { isId } from "../../../db/ids";
import type { StorageAdapter } from "../../../storage";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can } from "../../identity/models/permissions";
import type { VersionFile } from "../../items/models/item";
import type { ItemRepository } from "../../items/repositories/item-repository";
import {
  BulkLimitError,
  DependencyNotVisibleError,
  ItemNameTakenError,
  RELEASE_NOTES_MAX_LENGTH,
  ReleaseNotesError,
  ReleasePackError,
  ReleaseTagError,
  ReleaseVersionError,
  SubmissionInvalidError,
  SubmissionNotFoundError,
  VersionExistsError,
} from "../exceptions/errors";
import { manifestNamed } from "../models/manifest-names";
import { planReleases } from "../models/release-plan";
import type { RevisionFile } from "../models/review";
import { transition } from "../models/status";
import {
  fileBytes,
  itemNameOf,
  itemRefOf,
  MANIFEST_PATH,
  type Submission,
  toPackageFile,
} from "../models/submission";
import type { PublishedVersion, RegistryLookup } from "../repositories/registry-lookup";
import type { ReleaseStore } from "../repositories/release-store";
import { requireMember, requireSignedIn } from "./membership";
import { requireCurrent } from "./proposals";
import { MAX_BULK_RELEASE, prepareRelease } from "./release-group";
import { allIssues, type SubmissionActor, type SubmissionDeps } from "./submissions";

/**
 * Releasing an approved submission (feature 015, MVP §4.2): its approved revision is packed with
 * the computed version, stored through the StorageAdapter, and recorded as the item's new version
 * with its dist-tag, in one transaction that also marks the submission `published`.
 */
export type PublishDeps = SubmissionDeps & { store: ReleaseStore; storage: StorageAdapter };

export type PublishInput = {
  choice: ReleaseChoice;
  tag?: string;
  notes?: string;
  /** How it was released, for the audit log: many at once (055). */
  via?: "bulk";
};

export type Published = {
  itemId: string;
  versionId: string;
  version: string;
  tag: string;
  sha256: string;
  size: number;
};

const decoder = new TextDecoder();
const textOf = (file: RevisionFile | undefined): string | null => {
  return file?.encoding === "utf8" ? file.content : null;
};

/** The README a version shows: the manifest's `readme`, or `README.md` when there is one. */
const readmeOf = (manifest: Manifest, files: readonly RevisionFile[]) => {
  const path = typeof manifest.readme === "string" ? manifest.readme : "README.md";
  return textOf(files.find((file) => file.path === path));
};

/** One member of a release (112): the submission and the version settings it goes out with. */
export type ReleasePlan = { id: string; choice: ReleaseChoice; tag?: string };

/** A released member: what 015 answers, with which submission it was. */
export type ReleasedMember = Published & { id: string; name: string };

/**
 * The submission behind an id, if the actor may release it and it's approved: 015's errors, so a
 * single release refuses as it always has.
 */
const releasable = async (deps: PublishDeps, actor: SubmissionActor, id: string) => {
  const submission = isId(id) ? await deps.repo.find(id) : null;
  const mine = submission?.authorId === actor.user?.id;
  if (
    !submission ||
    !(mine || can(actor.user, "submissions.view_submitted", submission.workspace.id))
  )
    throw new SubmissionNotFoundError();
  // Its workspace's moderators and root release any; the author their own, while a member (091).
  if (!can(actor.user, "submissions.publish", submission.workspace.id)) {
    if (!mine) throw new ForbiddenError("submissions.publish");
    requireMember(actor, submission.workspace, "release your items there");
  }
  transition(submission.status, "publish");
  // A proposal with a newer version released since: 017's own error, before anything else.
  await requireCurrent(deps.repo.registry(), submission);
  return submission;
};

/**
 * A registry where the group's versions are already released (112): each member's checks see the
 * others' versions, so their ranges are checked against what goes out, and a cycle resolves.
 */
const withReleasing = (
  registry: RegistryLookup,
  releasing: ReadonlyMap<
    string,
    { submission: Submission; version: string; dependencies: Record<string, string> }
  >,
  at: Date,
): RegistryLookup => {
  const byItemId = new Map<string, string>();
  const going = (name: string): PublishedVersion | null => {
    const member = releasing.get(name);
    return member
      ? {
          id: `releasing:${name}`,
          version: member.version,
          publishedAt: at,
          artifactPath: "",
          sha256: "",
          yanked: false,
          dependencies: member.dependencies,
        }
      : null;
  };
  return {
    ...registry,
    findItem: async (ref) => {
      const full = formatItemName(ref);
      const found = await registry.findItem(ref);
      if (found) {
        byItemId.set(found.id, found.fullName);
        return found;
      }
      const member = releasing.get(full)?.submission;
      if (!member) return null;
      byItemId.set(`releasing:${full}`, full);
      return {
        id: `releasing:${full}`,
        fullName: full,
        scope: ref.scope,
        name: ref.name,
        type: member.type,
        workspace: {
          id: member.workspace.id,
          private: (await registry.privateWorkspaces([member.workspace.id])).has(
            member.workspace.id,
          ),
        },
      };
    },
    publishedVersions: async (itemId) => {
      const name = byItemId.get(itemId);
      const extra = name ? going(name) : null;
      const known = itemId.startsWith("releasing:") ? [] : await registry.publishedVersions(itemId);
      return extra ? [...known, extra] : known;
    },
  };
};

/**
 * Where a version's artifact goes, without `.tgz`: `scope/name/version` in `global`, as before, and
 * `@workspace/scope/name/version` elsewhere (118), so two workspaces' same-named items never meet.
 * Each version records its own path, so nothing stored before moves.
 */
export const artifactBase = (
  submission: Pick<Submission, "workspace" | "scope" | "name">,
  version: string,
) =>
  `${submission.workspace.name === GLOBAL_WORKSPACE ? "" : `@${submission.workspace.name}/`}${submission.scope.name}/${submission.name}/${version}`;

/**
 * The item a submission releases into: the one with its name now, or none yet. An old name (118)
 * belongs to the item that had it, so a submission named like one is refused, never released into
 * that item.
 */
export const ownItem = async (
  items: Pick<ItemRepository, "findByName" | "isOldName">,
  submission: Pick<Submission, "workspace" | "scope" | "name">,
) => {
  const name = itemNameOf(submission);
  const found = await items.findByName(itemRefOf(submission));
  // Said as "taken" to everyone: the release store reads every workspace (015), so it can't tell
  // whether the releaser sees the item that had the name; the checks before said more to members.
  if ((found && found.fullName !== name) || (!found && (await items.isOldName(name))))
    throw new ItemNameTakenError(name, "taken");
  return found;
};

/**
 * Releases a group in one go (112): each member's approved revision checked with the group's
 * versions counted as released, packed and stored, then every version recorded in one
 * transaction. If one can't go, none does: an artifact stored for a release that then fails isn't
 * referenced, and is harmless. With one member, it's 015's release as it always was.
 */
export const releaseTogether = async (
  deps: PublishDeps,
  actor: SubmissionActor,
  plans: readonly ReleasePlan[],
  input: { notes?: string; via?: "bulk" } = {},
): Promise<ReleasedMember[]> => {
  requireSignedIn(actor);
  const notes = (input.notes ?? "").trim() || null;
  if (notes && [...notes].length > RELEASE_NOTES_MAX_LENGTH) throw new ReleaseNotesError();
  const at = (deps.now ?? (() => new Date()))();

  // Each member: allowed, approved, its approved revision, and the version it gets.
  const members = [];
  for (const plan of plans) {
    const submission = await releasable(deps, actor, plan.id);
    // What was approved: the latest revision. The checks run again below, since a dependency may
    // have been yanked, or the name taken, since the approval.
    const revision = (await deps.repo.revisions(submission.id)).at(-1);
    const files = revision ? await deps.repo.revisionFiles(revision.id) : [];
    const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
    const manifest = manifestFile
      ? parseManifest(decoder.decode(fileBytes(manifestFile))).manifest
      : null;
    const planned = await deps.store.transaction(async ({ items }) => {
      const existing = await ownItem(items, submission);
      return existing ? (await items.versions(existing.id)).map((v) => v.version) : [];
    });
    const version = nextVersion(planned, plan.choice);
    if (!version) throw new ReleaseVersionError();
    const tag = plan.tag?.trim() || defaultTag(version);
    const problem = tagProblem(tag, version);
    if (problem) throw new ReleaseTagError(problem);
    members.push({ submission, revision, files, manifest, version, tag });
  }

  // A member's range on another member, against the version it goes out with: said plainly here,
  // since the checks below would only see it as not released (112).
  const planned = new Map(members.map((m) => [itemNameOf(m.submission), m.version]));
  for (const member of members)
    for (const [name, range] of Object.entries(
      (member.manifest?.dependencies ?? {}) as Record<string, string>,
    )) {
      const version = planned.get(name);
      if (version && !highestMatching([version], range))
        throw new SubmissionInvalidError(
          [
            {
              severity: "error",
              code: "dependency_range",
              message: `${name} goes out as ${version}, which ${itemNameOf(member.submission)}'s range ${range} doesn't match.`,
              file: MANIFEST_PATH,
              path: "/dependencies",
            },
          ],
          "release",
        );
    }

  // The checks, with the group's versions counted as released (112). Every dependency has to be
  // released by now, or go with it, not only be in review (056).
  const releasing = new Map(
    members.map((m) => [
      itemNameOf(m.submission),
      {
        submission: m.submission,
        version: m.version,
        dependencies: (m.manifest?.dependencies ?? {}) as Record<string, string>,
      },
    ]),
  );
  const base = deps.registry ?? deps.repo.registry();
  for (const member of members) {
    // The others' versions count as released; its own name is still checked as a new item's.
    const others = new Map(
      [...releasing].filter(([name]) => name !== itemNameOf(member.submission)),
    );
    const registry = withReleasing(base, others, at);
    const issues = await allIssues(
      { ...deps, registry },
      deps.repo,
      member.submission,
      member.files,
      {
        release: true,
      },
    );
    if (hasErrors(issues)) throw new SubmissionInvalidError(issues, "release");
    if (!member.manifest) throw new SubmissionInvalidError(issues);
  }

  // Packed and stored before the transaction: if it fails, a retry finds the same bytes.
  const packed: ((typeof members)[number] & {
    manifest: Manifest;
    pack: Awaited<ReturnType<typeof packItem>>;
    artifactPath: string;
  })[] = [];
  for (const member of members) {
    // The full names as they are now (118): the item's own, and each dependency's, whatever name
    // the author wrote for it (an old one, or `@global/…`).
    const names = new Map<string, string>();
    for (const dependency of Object.keys(
      (member.manifest?.dependencies ?? {}) as Record<string, string>,
    )) {
      const written = canonicalItemName(dependency);
      const ref = parseItemName(dependency);
      const found =
        written && releasing.has(written) ? null : ref ? await base.findItem(ref) : null;
      names.set(dependency, found?.fullName ?? written ?? dependency);
    }
    const files = member.files.map((file) =>
      file.path === MANIFEST_PATH && file.encoding === "utf8"
        ? { ...file, content: manifestNamed(file.content, itemNameOf(member.submission), names) }
        : file,
    );
    let pack: Awaited<ReturnType<typeof packItem>>;
    try {
      pack = await packItem(files.map(toPackageFile), {
        version: member.version,
        limits: deps.limits ?? DEFAULT_LIMITS,
      });
    } catch (error) {
      if (error instanceof PackError) throw new ReleasePackError(error.message);
      throw error;
    }
    // Artifacts never change. Bytes a failed release left at the version's path, which no version
    // points to, would block it for good: the new ones go next to them, named by their checksum.
    const at = artifactBase(member.submission, member.version);
    const stored = await deps.storage.get(`${at}.tgz`);
    const artifactPath =
      stored && createHash("sha256").update(stored).digest("hex") !== pack.sha256
        ? `${at}-${pack.sha256.slice(0, 12)}.tgz`
        : `${at}.tgz`;
    await deps.storage.put(artifactPath, pack.tgz);
    // What's stored is what was packed: the manifest with its names now, and those files.
    const renamed = files.find((file) => file.path === MANIFEST_PATH);
    const manifest =
      (renamed?.encoding === "utf8" ? parseManifest(renamed.content).manifest : null) ??
      (member.manifest as Manifest);
    packed.push({ ...member, files, manifest, pack, artifactPath });
  }

  return deps.store.transaction(async ({ submissions, items }) => {
    // Locked in one order; each still approved, and still current (017).
    for (const member of [...packed].sort((a, b) => (a.submission.id < b.submission.id ? -1 : 1))) {
      await submissions.lockSubmission(member.submission.id);
      const current = await submissions.find(member.submission.id);
      transition(current?.status ?? member.submission.status, "publish");
      await requireCurrent(submissions.registry(), member.submission);
    }

    // Every item it touches, locked in one order before anything else: the members' own and the
    // dependencies outside the group (as a yank locks them), so two releases never wait on each
    // other in opposite orders.
    // Then every workspace a dependency is in, in one sorted call: the lock Make private takes
    // (093), so a workspace turned private since the checks can't gain a dependent outside it.
    const groupNames = new Map(packed.map((m) => [itemNameOf(m.submission), m.submission]));
    const toLock = new Set<string>();
    const workspaces = new Set<string>();
    for (const member of packed) {
      const own = await ownItem(items, member.submission);
      if (own) toLock.add(own.id);
      for (const name of Object.keys(
        (member.manifest.dependencies ?? {}) as Record<string, string>,
      )) {
        const inGroup = groupNames.get(canonicalItemName(name) ?? name);
        if (inGroup) {
          workspaces.add(inGroup.workspace.id);
          continue;
        }
        const parsed = parseItemName(name);
        const target = parsed ? await items.findByName(parsed) : null;
        if (target) {
          toLock.add(target.id);
          workspaces.add(target.workspaceId);
        }
      }
    }
    for (const id of [...toLock].sort()) await items.lockItem(id);
    const privateOnes = await items.lockWorkspaces([...workspaces]);

    // Every member's item first, so items that need each other can point at each other.
    const itemIds = new Map<string, string>();
    for (const member of packed) {
      const { submission, manifest } = member;
      const existing = await ownItem(items, submission);
      const itemId =
        existing?.id ??
        (await items.insertItem({
          scopeId: submission.scope.id,
          name: submission.name,
          type: submission.type,
          description: String(manifest.description ?? ""),
          ownerId: submission.authorId,
          createdAt: at,
        }));
      if ((await items.versions(itemId)).some((v) => v.version === member.version))
        throw new VersionExistsError(itemNameOf(submission), member.version);
      itemIds.set(submission.id, itemId);
    }

    const released: ReleasedMember[] = [];
    for (const member of packed) {
      const { submission, manifest, files, revision, version, tag, pack, artifactPath } = member;
      const itemName = itemNameOf(submission);
      const itemId = itemIds.get(submission.id) ?? "";
      const dependencies: { itemId: string; range: string }[] = [];
      const targets: { name: string; workspaceId: string }[] = [];
      for (const [name, range] of Object.entries(
        (manifest.dependencies ?? {}) as Record<string, string>,
      )) {
        const parsed = parseItemName(name);
        const target = parsed ? await items.findByName(parsed) : null;
        // The registry checks above refused unknown dependencies; this is a second guard.
        if (!target)
          throw new SubmissionInvalidError([
            {
              severity: "error",
              code: "dependency_not_found",
              message: `${name} isn't a published item.`,
              file: MANIFEST_PATH,
              path: "/dependencies",
            },
          ]);
        // One outside the group (locked above): still a version in its range.
        if (![...itemIds.values()].includes(target.id)) {
          const usable = (await items.versions(target.id))
            .filter((v) => v.yankedAt === null)
            .map((v) => v.version);
          if (!highestMatching(usable, range))
            throw new SubmissionInvalidError(
              [
                {
                  severity: "error",
                  code: "dependency_range",
                  message: `No published version of ${name} matches ${range}.`,
                  file: MANIFEST_PATH,
                  path: "/dependencies",
                },
              ],
              "release",
            );
        }
        dependencies.push({ itemId: target.id, range });
        targets.push({ name, workspaceId: target.workspaceId });
      }
      // Checked again under the lock Make private takes (093), taken above.
      const hidden = targets.find(
        (t) => privateOnes.has(t.workspaceId) && t.workspaceId !== submission.workspace.id,
      );
      if (hidden)
        throw new SubmissionInvalidError(
          [
            {
              severity: "error",
              code: "dependency_not_visible",
              message: new DependencyNotVisibleError(hidden.name).message,
              file: MANIFEST_PATH,
              path: "/dependencies",
            },
          ],
          "release",
        );

      const versionFiles: VersionFile[] = files.map((file) => ({
        path: file.path,
        size: file.size,
        executable: file.executable,
      }));
      const versionId = await items.insertVersion({
        itemId,
        version,
        manifest: { ...manifest, version },
        readme: readmeOf(manifest, files),
        files: versionFiles,
        notes,
        artifactPath,
        sha256: pack.sha256,
        size: pack.size,
        publishedBy: actor.user?.id ?? "",
        publishedAt: at,
        submissionId: submission.id,
        dependencies,
        riskFlags: riskFlags(manifest, files.map(toPackageFile)),
      });
      await items.updateDescription(itemId, String(manifest.description ?? ""));
      const previousId = await items.setTag(itemId, tag, versionId);
      const previous = previousId
        ? ((await items.versions(itemId)).find((v) => v.id === previousId)?.version ?? null)
        : null;

      await submissions.setStatus(submission.id, transition(submission.status, "publish"), {
        updatedAt: at,
      });
      await submissions.addEvent({
        submissionId: submission.id,
        actorId: actor.user?.id ?? "",
        kind: "publish",
        body: version,
        revision: revision?.number ?? null,
        createdAt: at,
      });
      await submissions.recordAudit(
        {
          actorId: actor.user?.id ?? null,
          action: "version.published",
          target: { type: "item_version", id: versionId },
          metadata: {
            name: itemName,
            version,
            tag,
            sha256: pack.sha256,
            ...(input.via ? { via: input.via } : {}),
          },
          ipAddress: actor.ip,
        },
        at,
      );
      await submissions.recordAudit(
        {
          actorId: actor.user?.id ?? null,
          action: "dist_tag.moved",
          target: { type: "item", id: itemId },
          metadata: {
            name: itemName,
            tag,
            from: previous,
            to: version,
            ...(input.via ? { via: input.via } : {}),
          },
          ipAddress: actor.ip,
        },
        at,
      );
      released.push({
        id: submission.id,
        name: itemName,
        itemId,
        versionId,
        version,
        tag,
        sha256: pack.sha256,
        size: pack.size,
      });
    }
    return released;
  });
};

/**
 * Releases an approved submission (015) with its approved dependencies that aren't released yet,
 * through the chain and round any cycle (112): the item with the person's settings, each other
 * member with the same kind (stable or pre-release) and its own suggested bump. `with` lists the
 * others. A dependency that can't go (not approved, or not the person's to release) refuses it.
 */
export const publishSubmission = async (
  deps: PublishDeps,
  actor: SubmissionActor,
  id: string,
  input: PublishInput,
): Promise<Published & { with: ReleasedMember[] }> => {
  requireSignedIn(actor);
  await releasable(deps, actor, id);
  const { candidates, refused } = await prepareRelease(deps, actor, { ids: [id] });
  const refusal = refused.find((r) => r.id === id);
  if (refusal && refusal.result === "not_releasable")
    throw new SubmissionInvalidError(
      [
        {
          severity: "error",
          code: "release_group",
          // "It waits on …" reads on after "It can't be released yet: ".
          message: refusal.reason.replace(/^It /, "it "),
          file: MANIFEST_PATH,
        },
      ],
      "release",
    );
  if (candidates.length > MAX_BULK_RELEASE)
    throw new BulkLimitError(candidates.length, MAX_BULK_RELEASE);
  const others = planReleases(
    candidates.filter((c) => c.id !== id),
    {
      kind: input.choice.kind,
      ...(input.choice.kind === "prerelease" ? { id: input.choice.id } : {}),
      bump: "suggested",
    },
  );
  const failed = others.find((plan) => !plan.ok);
  if (failed && !failed.ok) throw new ReleaseVersionError();
  const plans = (candidates.length > 0 ? candidates.map((c) => c.id) : [id]).map(
    (member): ReleasePlan => {
      if (member === id) return { id, choice: input.choice, tag: input.tag };
      const plan = others.find((p) => p.id === member);
      return plan?.ok
        ? { id: member, choice: plan.choice, tag: plan.tag }
        : { id: member, choice: input.choice };
    },
  );
  const released = await releaseTogether(deps, actor, plans, input);
  const item = released.find((r) => r.id === id);
  if (!item) throw new SubmissionNotFoundError();
  const { id: _id, name: _name, ...published } = item;
  return { ...published, with: released.filter((r) => r.id !== id) };
};
