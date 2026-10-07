import {
  DEFAULT_LIMITS,
  defaultTag,
  hasErrors,
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
import { canInSome, requireInSome } from "../../identity/models/permissions";
import type { VersionFile } from "../../items/models/item";
import {
  RELEASE_NOTES_MAX_LENGTH,
  ReleaseNotesError,
  ReleasePackError,
  ReleaseTagError,
  ReleaseVersionError,
  SubmissionInvalidError,
  SubmissionNotFoundError,
  VersionExistsError,
} from "../exceptions/errors";
import type { RevisionFile } from "../models/review";
import { transition } from "../models/status";
import { fileBytes, itemNameOf, MANIFEST_PATH, toPackageFile } from "../models/submission";
import type { ReleaseStore } from "../repositories/release-store";
import { requireCurrent } from "./proposals";
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

export const publishSubmission = async (
  deps: PublishDeps,
  actor: SubmissionActor,
  id: string,
  input: PublishInput,
): Promise<Published> => {
  requireInSome(actor.user, "submissions.create");
  const submission = isId(id) ? await deps.repo.find(id) : null;
  const mine = submission?.authorId === actor.user?.id;
  if (!submission || !(mine || canInSome(actor.user, "submissions.view_submitted")))
    throw new SubmissionNotFoundError();
  if (!mine) requireInSome(actor.user, "submissions.publish");
  transition(submission.status, "publish");
  const itemName = itemNameOf(submission);

  // What was approved: the latest revision. The checks run again, since a dependency may have been
  // yanked, or the name taken, since the approval.
  const revision = (await deps.repo.revisions(submission.id)).at(-1);
  const files = revision ? await deps.repo.revisionFiles(revision.id) : [];
  // Every dependency has to be released by now, not only in review (056).
  const issues = await allIssues(deps, deps.repo, submission, files, { release: true });
  if (hasErrors(issues)) throw new SubmissionInvalidError(issues, "release");
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(decoder.decode(fileBytes(manifestFile))).manifest
    : null;
  if (!manifest) throw new SubmissionInvalidError(issues);

  const notes = (input.notes ?? "").trim() || null;
  if (notes && [...notes].length > RELEASE_NOTES_MAX_LENGTH) throw new ReleaseNotesError();

  const planned = await deps.store.transaction(async ({ items }) => {
    const existing = await items.findByName(submission.scope.name, submission.name);
    return existing ? (await items.versions(existing.id)).map((v) => v.version) : [];
  });
  const version = nextVersion(planned, input.choice);
  if (!version) throw new ReleaseVersionError();
  const tag = input.tag?.trim() || defaultTag(version);
  const problem = tagProblem(tag, version);
  if (problem) throw new ReleaseTagError(problem);

  let packed: Awaited<ReturnType<typeof packItem>>;
  try {
    packed = await packItem(files.map(toPackageFile), {
      version,
      limits: deps.limits ?? DEFAULT_LIMITS,
    });
  } catch (error) {
    if (error instanceof PackError) throw new ReleasePackError(error.message);
    throw error;
  }
  // Stored before the transaction: if the transaction fails, a retry finds the same bytes.
  const artifactPath = `${submission.scope.name}/${submission.name}/${version}.tgz`;
  await deps.storage.put(artifactPath, packed.tgz);

  const at = (deps.now ?? (() => new Date()))();
  return deps.store.transaction(async ({ submissions, items }) => {
    await submissions.lockSubmission(submission.id);
    const current = await submissions.find(submission.id);
    transition(current?.status ?? submission.status, "publish");
    // Another proposal may have been released since this one was approved (017).
    await requireCurrent(submissions.registry(), submission);

    const existing = await items.findByName(submission.scope.name, submission.name);
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
    await items.lockItem(itemId);
    if ((await items.versions(itemId)).some((v) => v.version === version))
      throw new VersionExistsError(itemName, version);

    const dependencies: { itemId: string; range: string }[] = [];
    for (const [name, range] of Object.entries(
      (manifest.dependencies ?? {}) as Record<string, string>,
    )) {
      const parsed = parseItemName(name);
      const target = parsed ? await items.findByName(parsed.scope, parsed.name) : null;
      // The registry checks above refused unknown dependencies; this is a second guard.
      if (!target) throw new SubmissionInvalidError(issues);
      dependencies.push({ itemId: target.id, range });
    }

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
      sha256: packed.sha256,
      size: packed.size,
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
          sha256: packed.sha256,
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
    return { itemId, versionId, version, tag, sha256: packed.sha256, size: packed.size };
  });
};
