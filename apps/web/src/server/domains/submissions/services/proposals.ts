import { DEFAULT_LIMITS, parseItemName } from "@ronneai/core";
import { PackError, unpackItem } from "@ronneai/core/pack";
import { parseDocument } from "yaml";
import { isId } from "../../../db/ids";
import type { StorageAdapter } from "../../../storage";
import { requirePermission } from "../../identity/models/permissions";
import {
  ConflictNotFoundError,
  NotAProposalError,
  ProposalArtifactError,
  ProposalBaseNotFoundError,
  ProposalCurrentError,
  SubmissionNotEditableError,
  SubmissionNotFoundError,
  SubmissionStaleError,
  SubmissionsError,
} from "../exceptions/errors";
import { diffRevisions, type FileChange } from "../models/diff";
import { staleAgainst } from "../models/proposal";
import { mergeFiles } from "../models/rebase";
import { isEditable, transition } from "../models/status";
import {
  byteSize,
  type Draft,
  type DraftFile,
  itemNameOf,
  MANIFEST_PATH,
  type Submission,
  toDraftContent,
} from "../models/submission";
import type { PublishedVersion, RegistryLookup } from "../repositories/registry-lookup";
import type { DraftActor, DraftDeps } from "./drafts";
import type { SubmissionActor } from "./submissions";

/**
 * Change proposals (feature 017, MVP §4.1): a draft of a published item's next version, started from
 * one of its versions. It keeps the item's scope, name and type; everything else works as a new
 * item's draft does. Anyone signed in may propose, in any scope (MVP §2).
 */
export type ProposalDeps = DraftDeps & { storage: StorageAdapter; registry?: RegistryLookup };

/** A version's file as a draft stores it, without `updatedAt`. */
export type BaseFile = Omit<DraftFile, "updatedAt">;

/** ronne.yaml without `version`, which the release sets; unchanged if it can't be read. */
const withoutVersion = (text: string): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0 || !doc.has("version")) return text;
  doc.delete("version");
  return doc.toString();
};

/**
 * A published version's files, read back from its artifact, as a proposal starts from them: the
 * manifest loses the `version` the release wrote into it.
 */
export const versionFiles = async (
  deps: Pick<ProposalDeps, "storage" | "limits">,
  itemName: string,
  version: Pick<PublishedVersion, "version" | "artifactPath">,
): Promise<BaseFile[]> => {
  const tgz = await deps.storage.get(version.artifactPath);
  if (!tgz) throw new ProposalArtifactError(itemName, version.version);
  let unpacked: ReturnType<typeof unpackItem>;
  try {
    unpacked = unpackItem(tgz, deps.limits ?? DEFAULT_LIMITS);
  } catch (error) {
    if (error instanceof PackError) throw new ProposalArtifactError(itemName, version.version);
    throw error;
  }
  return unpacked
    .map((file) => {
      const stored = toDraftContent(file.bytes);
      const content =
        file.path === MANIFEST_PATH && stored.encoding === "utf8"
          ? { encoding: "utf8" as const, content: withoutVersion(stored.content) }
          : stored;
      return {
        path: file.path,
        ...content,
        size: byteSize(content),
        executable: file.executable ?? false,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
};

/**
 * Starts a proposal to change `@scope/name` from `version` (the item page's shown version): a draft
 * with the item's scope, name and type, whose files are that version's.
 */
export const proposeChange = async (
  deps: ProposalDeps,
  actor: DraftActor,
  input: { item: string; version: string },
): Promise<Draft> => {
  requirePermission(actor.user, "submissions.create");
  const parsed = parseItemName(input.item);
  const registry = deps.registry ?? deps.repo.registry();
  const item = parsed ? await registry.findItem(parsed.scope, parsed.name) : null;
  if (!parsed || !item) throw new ProposalBaseNotFoundError(input.item);
  const itemName = `@${item.scope}/${item.name}`;
  const base = (await registry.publishedVersions(item.id)).find((v) => v.version === input.version);
  if (!base) throw new ProposalBaseNotFoundError(itemName, input.version);
  const files = await versionFiles(deps, itemName, base);

  const at = (deps.now ?? (() => new Date()))();
  const authorId = actor.user?.id ?? "";
  return deps.repo.transaction(async (repo) => {
    const scope = await repo.findScope(item.scope);
    // Scopes and items are never deleted; this only guards the types.
    if (!scope) throw new SubmissionNotFoundError();
    const id = await repo.insert({
      authorId,
      scopeId: scope.id,
      name: item.name,
      type: item.type,
      status: "draft",
      createdAt: at,
      proposal: { itemId: item.id, baseVersionId: base.id },
    });
    const written = files.map((file) => ({ ...file, updatedAt: at }));
    for (const file of written) await repo.writeFile(id, file);
    return {
      id,
      authorId,
      scope,
      name: item.name,
      type: item.type,
      status: "draft",
      createdAt: at,
      updatedAt: at,
      submittedAt: null,
      proposal: {
        itemId: item.id,
        baseVersionId: base.id,
        baseVersion: base.version,
        conflicts: [],
      },
      files: written,
    };
  });
};

/** The version a proposal is behind, or null: new items and up-to-date proposals aren't stale. */
export const staleVersion = async (
  registry: RegistryLookup,
  submission: Pick<Submission, "proposal">,
): Promise<string | null> =>
  submission.proposal
    ? staleAgainst(
        submission.proposal.baseVersion,
        await registry.publishedVersions(submission.proposal.itemId),
      )
    : null;

/** Refuses to approve or release a stale proposal: it would undo what the newer version changed. */
export const requireCurrent = async (registry: RegistryLookup, submission: Submission) => {
  const newer = await staleVersion(registry, submission);
  if (newer && submission.proposal)
    throw new SubmissionStaleError(
      `@${submission.scope.name}/${submission.name}`,
      submission.proposal.baseVersion,
      newer,
    );
};

/** The actor's own change proposal, or SubmissionNotFoundError / NotAProposalError. */
const ownProposal = async (deps: ProposalDeps, actor: DraftActor, id: string) => {
  requirePermission(actor.user, "submissions.create");
  const submission = isId(id) ? await deps.repo.find(id) : null;
  if (!submission || submission.authorId !== actor.user?.id) throw new SubmissionNotFoundError();
  if (!submission.proposal) throw new NotAProposalError();
  return { ...submission, proposal: submission.proposal };
};

export type Rebased = Draft & { conflicts: string[] };

/**
 * Moves a stale proposal onto its item's newest version (017), merging by whole files
 * (`models/rebase.ts`): what only the author changed stays, what only the newer version changed
 * comes in, and what both changed stays the author's, listed as a conflict to resolve before
 * submitting. A proposal under review or approved goes back to `changes_requested` first. The files
 * are read from both versions' artifacts before the transaction; inside it, the proposal is locked
 * and must still be on the base the merge started from.
 */
export const rebaseProposal = async (
  deps: ProposalDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Rebased> => {
  const submission = await ownProposal(deps, actor, id);
  const status = isEditable(submission.status)
    ? submission.status
    : transition(submission.status, "rebase");
  const registry = deps.registry ?? deps.repo.registry();
  const versions = await registry.publishedVersions(submission.proposal.itemId);
  const newerVersion = staleAgainst(submission.proposal.baseVersion, versions);
  if (!newerVersion) throw new ProposalCurrentError(submission.proposal.baseVersion);
  const base = versions.find((v) => v.id === submission.proposal.baseVersionId);
  const newer = versions.find((v) => v.version === newerVersion);
  const itemName = itemNameOf(submission);
  if (!base || !newer) throw new ProposalBaseNotFoundError(itemName, newerVersion);
  const baseFiles = await versionFiles(deps, itemName, base);
  const newerFiles = await versionFiles(deps, itemName, newer);

  const at = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    await repo.lockSubmission(submission.id);
    const current = await repo.find(submission.id);
    if (current?.status !== submission.status || current.proposal?.baseVersionId !== base.id)
      throw new SubmissionNotEditableError();
    const mine = await repo.files(submission.id);
    const { files, conflicts } = mergeFiles(
      new Map(baseFiles.map((f) => [f.path, f])),
      new Map(mine.map((f) => [f.path, f])),
      new Map(newerFiles.map((f): [string, DraftFile] => [f.path, { ...f, updatedAt: at }])),
    );
    const before = new Map(mine.map((f) => [f.path, f]));
    for (const path of before.keys())
      if (!files.has(path)) await repo.deleteFile(submission.id, path);
    for (const [path, file] of files)
      if (before.get(path) !== file) await repo.writeFile(submission.id, file);
    await repo.setProposalBase(submission.id, newer.id, conflicts);
    if (status !== submission.status)
      await repo.setStatus(submission.id, status, { updatedAt: at });
    else await repo.update(submission.id, { updatedAt: at });
    if (submission.status !== "draft")
      await repo.addEvent({
        submissionId: submission.id,
        actorId: actor.user?.id ?? "",
        kind: "rebase",
        body: newer.version,
        revision: (await repo.revisions(submission.id)).at(-1)?.number ?? null,
        createdAt: at,
      });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "submission.rebased",
        target: { type: "submission", id: submission.id },
        metadata: { name: itemName, from: base.version, to: newer.version, conflicts },
        ipAddress: actor.ip,
      },
      at,
    );
    return {
      ...submission,
      status,
      updatedAt: at,
      proposal: {
        ...submission.proposal,
        baseVersionId: newer.id,
        baseVersion: newer.version,
        conflicts,
      },
      files: [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
      conflicts,
    };
  });
};

/** Marks one of the last rebase's conflicts resolved: the author has made the file what it should be. */
export const resolveConflict = async (
  deps: ProposalDeps,
  actor: DraftActor,
  id: string,
  path: string,
): Promise<string[]> => {
  const at = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const submission = await ownProposal({ ...deps, repo }, actor, id);
    if (!isEditable(submission.status)) throw new SubmissionNotEditableError();
    if (!submission.proposal.conflicts.includes(path)) throw new ConflictNotFoundError(path);
    const conflicts = submission.proposal.conflicts.filter((p) => p !== path);
    await repo.setConflicts(submission.id, conflicts);
    await repo.update(submission.id, { updatedAt: at });
    return conflicts;
  });
};

/** The files of the version a proposal is based on, or null for a new item. */
export const baseFilesOf = async (
  deps: Pick<ProposalDeps, "storage" | "limits">,
  registry: RegistryLookup,
  submission: Pick<Submission, "proposal" | "scope" | "name">,
): Promise<BaseFile[] | null> => {
  if (!submission.proposal) return null;
  const { baseVersionId, baseVersion, itemId } = submission.proposal;
  const version = (await registry.publishedVersions(itemId)).find((v) => v.id === baseVersionId);
  if (!version) throw new ProposalBaseNotFoundError(itemNameOf(submission), baseVersion);
  return versionFiles(deps, itemNameOf(submission), version);
};

/** Proposals that can still move on; a closed one is never shown as stale. */
const OPEN_PROPOSAL = new Set<Submission["status"]>([
  "draft",
  "submitted",
  "changes_requested",
  "approved",
]);

/** Each submission with the version it's behind (017), for lists: null for new items and closed ones. */
export const withStale = async <S extends Submission>(
  registry: RegistryLookup,
  submissions: readonly S[],
): Promise<(S & { stale: string | null })[]> =>
  Promise.all(
    submissions.map(async (submission) => ({
      ...submission,
      stale: OPEN_PROPOSAL.has(submission.status) ? await staleVersion(registry, submission) : null,
    })),
  );

/** What the author's editor shows about a proposal: its base, whether it's stale, and its conflicts. */
export type ProposalPanel = {
  baseVersion: string;
  stale: string | null;
  /** Each conflict, with the file as the base version has it against the author's; null if unreadable. */
  conflicts: { path: string; change: FileChange | null }[];
};

export const proposalPanel = async (
  deps: ProposalDeps,
  actor: DraftActor,
  id: string,
): Promise<ProposalPanel> => {
  const submission = await ownProposal(deps, actor, id);
  const registry = deps.registry ?? deps.repo.registry();
  const { conflicts, baseVersion } = submission.proposal;
  let base: BaseFile[] | null = null;
  if (conflicts.length)
    try {
      base = await baseFilesOf(deps, registry, submission);
    } catch (error) {
      if (!(error instanceof SubmissionsError)) throw error;
    }
  const mine = conflicts.length ? await deps.repo.files(submission.id) : [];
  const only = (files: readonly BaseFile[], path: string) => files.filter((f) => f.path === path);
  return {
    baseVersion,
    stale: await staleVersion(registry, submission),
    conflicts: conflicts.map((path) => ({
      path,
      change: base ? (diffRevisions(only(base, path), only(mine, path))[0] ?? null) : null,
    })),
  };
};
