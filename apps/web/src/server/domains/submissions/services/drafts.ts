import {
  DEFAULT_LIMITS,
  isItemType,
  type ManifestIssue,
  nameProblem,
  normalizeScopeName,
  type PackageLimits,
  pathProblem,
} from "@ronneai/core";
import { isScalar, parseDocument } from "yaml";
import { isId } from "../../../db/ids";
import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  DraftLimitError,
  DraftNotEditableError,
  DraftScopeNotFoundError,
  FileTooLargeError,
  InvalidFileContentError,
  InvalidFilePathError,
  InvalidItemNameError,
  InvalidItemTypeError,
  ManifestRequiredError,
  StaleFilesError,
  SubmissionNotFoundError,
  ZipImportError,
} from "../exceptions/errors";
import {
  byteSize,
  type Draft,
  type DraftFile,
  isBase64,
  itemNameOf,
  MANIFEST_PATH,
  type Submission,
  toDraftContent,
  validateDraft,
} from "../models/submission";
import { draftTemplate } from "../models/templates";
import { readZip } from "../models/zip";
import type { SubmissionRepository } from "../repositories/submission-repository";

/**
 * Drafts (feature 012). Anyone signed in writes drafts of new items; a draft is visible only to its
 * author, so everyone else, root included, gets SubmissionNotFoundError. Drafts are private work in
 * progress, so nothing here is audited; 013 records submitting and withdrawing.
 */
export type DraftDeps = { repo: SubmissionRepository; now?: () => Date; limits?: PackageLimits };
export type DraftActor = { user: CurrentUser | null };

/** By code unit, as the repository returns them. */
const sortByPath = <T extends { path: string }>(files: T[]): T[] =>
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const now = (deps: DraftDeps) => (deps.now ?? (() => new Date()))();
const limitsOf = (deps: DraftDeps) => deps.limits ?? DEFAULT_LIMITS;

/** The actor's own submission, or SubmissionNotFoundError: someone else's looks like a missing one. */
const ownSubmission = async (
  repo: SubmissionRepository,
  actor: DraftActor,
  id: string,
): Promise<Submission> => {
  requirePermission(actor.user, "submissions.create");
  const submission = isId(id) ? await repo.find(id) : null;
  if (!submission || submission.authorId !== actor.user?.id) throw new SubmissionNotFoundError();
  return submission;
};

const ownDraft = async (repo: SubmissionRepository, actor: DraftActor, id: string) => {
  const submission = await ownSubmission(repo, actor, id);
  if (submission.status !== "draft") throw new DraftNotEditableError();
  return submission;
};

const itemNameFrom = (value: string): string => {
  const name = value.trim().toLowerCase();
  const problem = nameProblem(name, "item");
  if (problem) throw new InvalidItemNameError(problem);
  return name;
};

const findScope = async (repo: SubmissionRepository, value: string) => {
  const name = normalizeScopeName(value);
  const scope = name ? await repo.findScope(name) : null;
  if (!scope) throw new DraftScopeNotFoundError(name);
  return scope;
};

export const createDraft = async (
  deps: DraftDeps,
  actor: DraftActor,
  input: { scope: string; name: string; type: string },
): Promise<Draft> => {
  requirePermission(actor.user, "submissions.create");
  const authorId = actor.user?.id ?? "";
  const name = itemNameFrom(input.name);
  if (!isItemType(input.type)) throw new InvalidItemTypeError(input.type);
  const type = input.type;
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const scope = await findScope(repo, input.scope);
    const id = await repo.insert({
      authorId,
      scopeId: scope.id,
      name,
      type,
      status: "draft",
      createdAt: at,
    });
    const files: DraftFile[] = sortByPath(draftTemplate(type, itemNameOf({ scope, name }))).map(
      (file) => ({
        path: file.path,
        encoding: "utf8",
        content: file.content,
        size: byteSize({ encoding: "utf8", content: file.content }),
        executable: file.executable ?? false,
        updatedAt: at,
      }),
    );
    for (const file of files) await repo.writeFile(id, file);
    return {
      id,
      authorId,
      scope,
      name,
      type,
      status: "draft",
      createdAt: at,
      updatedAt: at,
      submittedAt: null,
      files,
    };
  });
};

/** Your own drafts and submissions, newest change first. */
export const listMySubmissions = async (
  deps: DraftDeps,
  actor: DraftActor,
): Promise<Submission[]> => {
  requirePermission(actor.user, "submissions.create");
  return deps.repo.listByAuthor(actor.user?.id ?? "");
};

export const getDraft = async (deps: DraftDeps, actor: DraftActor, id: string): Promise<Draft> => {
  const submission = await ownSubmission(deps.repo, actor, id);
  return { ...submission, files: await deps.repo.files(submission.id) };
};

/**
 * A file the editor saves. `loadedAt` is the `updatedAt` it had when the editor loaded it, or null
 * for a file the editor created; a mismatch means it changed elsewhere since.
 */
export type FileWrite = {
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  executable: boolean;
  loadedAt: Date | null;
};
export type FileDelete = { path: string; loadedAt: Date | null };
export type DraftChanges = {
  writes: readonly FileWrite[];
  deletes: readonly FileDelete[];
  /** Save even over files that changed since they were loaded. */
  overwrite?: boolean;
};
export type SavedDraft = { draft: Draft; issues: ManifestIssue[] };

/** Checks what can be checked without the database, so a bad save touches nothing. */
const checkChanges = (changes: DraftChanges, limits: PackageLimits) => {
  const seen = new Set<string>();
  for (const { path } of [...changes.writes, ...changes.deletes]) {
    const problem = pathProblem(path);
    if (problem) throw new InvalidFilePathError(path, problem);
    if (seen.has(path)) throw new InvalidFilePathError(path, "appears twice in one save");
    seen.add(path);
  }
  if (changes.deletes.some((file) => file.path === MANIFEST_PATH))
    throw new ManifestRequiredError();
  for (const file of changes.writes) {
    if (file.encoding === "base64" && !isBase64(file.content))
      throw new InvalidFileContentError(file.path);
    const size = byteSize(file);
    if (size > limits.maxFileBytes)
      throw new FileTooLargeError(file.path, size, limits.maxFileBytes);
  }
};

const totals = (files: Iterable<{ size: number }>) => {
  let count = 0;
  let bytes = 0;
  for (const file of files) {
    count += 1;
    bytes += file.size;
  }
  return { count, bytes };
};

/**
 * Writes and deletes files in one transaction, and returns the draft with 011's issues. A draft
 * may be saved with errors. A draft already over a limit (the limits can shrink) can still be
 * saved as long as the save doesn't make it bigger.
 */
export const saveDraftFiles = async (
  deps: DraftDeps,
  actor: DraftActor,
  id: string,
  changes: DraftChanges,
): Promise<SavedDraft> => {
  const limits = limitsOf(deps);
  checkChanges(changes, limits);
  const at = now(deps);
  const draft = await deps.repo.transaction(async (repo) => {
    const submission = await ownDraft(repo, actor, id);
    const current = new Map((await repo.files(submission.id)).map((file) => [file.path, file]));

    if (!changes.overwrite) {
      const stale = [...changes.writes, ...changes.deletes]
        .filter(
          (file) =>
            (current.get(file.path)?.updatedAt.getTime() ?? null) !==
            (file.loadedAt?.getTime() ?? null),
        )
        .map((file) => file.path);
      if (stale.length > 0) throw new StaleFilesError(stale);
    }

    const next = new Map(current);
    for (const file of changes.deletes) next.delete(file.path);
    const written: DraftFile[] = changes.writes.map((file) => ({
      path: file.path,
      encoding: file.encoding,
      content: file.content,
      size: byteSize(file),
      executable: file.executable,
      updatedAt: at,
    }));
    for (const file of written) next.set(file.path, file);

    const before = totals(current.values());
    const after = totals(next.values());
    if (after.count > limits.maxFiles && after.count > before.count)
      throw new DraftLimitError("files", after.count, limits.maxFiles);
    if (after.bytes > limits.maxTotalBytes && after.bytes > before.bytes)
      throw new DraftLimitError("total", after.bytes, limits.maxTotalBytes);

    for (const file of changes.deletes)
      if (current.has(file.path)) await repo.deleteFile(submission.id, file.path);
    for (const file of written) await repo.writeFile(submission.id, file);
    await repo.update(submission.id, { updatedAt: at });

    const files = [...next.values()].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    return { ...submission, updatedAt: at, files };
  });
  return { draft, issues: validateDraft(draft, draft.files, limits) };
};

/**
 * Imports a .zip of the item. `merge` writes the archive's files over the draft's and keeps the
 * rest; `replace` leaves only the archive's. The archive is read and checked completely first, so a
 * refused import changes nothing. Importing is an explicit overwrite, so stale files don't stop it.
 */
export const importZip = async (
  deps: DraftDeps,
  actor: DraftActor,
  id: string,
  input: { archive: Uint8Array; mode: "merge" | "replace" },
): Promise<SavedDraft> => {
  requirePermission(actor.user, "submissions.create");
  const draft = await getDraft(deps, actor, id);
  const files = readZip(input.archive, limitsOf(deps));
  const paths = new Set(files.map((file) => file.path));
  if (input.mode === "replace" && !paths.has(MANIFEST_PATH))
    throw new ZipImportError(
      "it has no ronne.yaml, and replacing would leave the draft without one. Merge it instead.",
    );
  return saveDraftFiles(deps, actor, id, {
    writes: files.map((file) => ({
      path: file.path,
      ...toDraftContent(file.bytes),
      executable: file.executable,
      loadedAt: null,
    })),
    deletes:
      input.mode === "replace"
        ? draft.files
            .filter((file) => !paths.has(file.path))
            .map((file) => ({ path: file.path, loadedAt: file.updatedAt }))
        : [],
    overwrite: true,
  });
};

/** ronne.yaml with `name` changed, keeping its comments and quoting; unchanged if it can't be read. */
const renamedManifest = (text: string, from: string, to: string): string => {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;
  const node = doc.get("name", true);
  if (!isScalar(node) || node.value !== from) return text;
  node.value = to;
  return doc.toString();
};

/**
 * Moves the draft to another scope or name; the type stays. ronne.yaml's `name` follows when it
 * still matched the old name. Drafts don't reserve names: 013 checks open submissions.
 */
export const renameDraft = async (
  deps: DraftDeps,
  actor: DraftActor,
  id: string,
  input: { scope: string; name: string },
): Promise<Submission> => {
  const name = itemNameFrom(input.name);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await ownDraft(repo, actor, id);
    const scope = await findScope(repo, input.scope);
    const renamed = { ...submission, scope, name, updatedAt: at };
    const manifest = (await repo.files(submission.id)).find((file) => file.path === MANIFEST_PATH);
    if (manifest?.encoding === "utf8") {
      const content = renamedManifest(
        manifest.content,
        itemNameOf(submission),
        itemNameOf(renamed),
      );
      if (content !== manifest.content)
        await repo.writeFile(submission.id, {
          ...manifest,
          content,
          size: byteSize({ encoding: "utf8", content }),
          updatedAt: at,
        });
    }
    await repo.update(submission.id, { scopeId: scope.id, name, updatedAt: at });
    return renamed;
  });
};

/** Removes a draft and its files for good: it was never submitted, so there's no history to keep. */
export const deleteDraft = async (
  deps: DraftDeps,
  actor: DraftActor,
  id: string,
): Promise<void> => {
  await deps.repo.transaction(async (repo) => {
    const submission = await ownDraft(repo, actor, id);
    await repo.delete(submission.id);
  });
};
