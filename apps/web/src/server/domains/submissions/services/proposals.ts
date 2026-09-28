import { DEFAULT_LIMITS, parseItemName } from "@ronneai/core";
import { PackError, unpackItem } from "@ronneai/core/pack";
import { parseDocument } from "yaml";
import type { StorageAdapter } from "../../../storage";
import { requirePermission } from "../../identity/models/permissions";
import {
  ProposalArtifactError,
  ProposalBaseNotFoundError,
  SubmissionNotFoundError,
  SubmissionStaleError,
} from "../exceptions/errors";
import { staleAgainst } from "../models/proposal";
import type { Submission } from "../models/submission";
import {
  byteSize,
  type Draft,
  type DraftFile,
  MANIFEST_PATH,
  toDraftContent,
} from "../models/submission";
import type { PublishedVersion, RegistryLookup } from "../repositories/registry-lookup";
import type { DraftActor, DraftDeps } from "./drafts";

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
      proposal: { itemId: item.id, baseVersionId: base.id, baseVersion: base.version },
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
