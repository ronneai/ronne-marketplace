import {
  DEFAULT_LIMITS,
  type ItemType,
  isItemType,
  type ManifestIssue,
  nameProblem,
  normalizeScopeName,
  type PackageLimits,
  parseItemName,
  pathProblem,
} from "@ronneai/core";
import { isScalar, parseDocument } from "yaml";
import { isId } from "../../../db/ids";
import type { SortDir } from "../../../db/keyset";
import type { StorageAdapter } from "../../../storage";
import type { CurrentUser } from "../../identity/models/user";
import {
  DraftLimitError,
  DraftMismatchError,
  DraftQuotaError,
  DraftScopeNotFoundError,
  FileTooLargeError,
  InvalidFileContentError,
  InvalidFilePathError,
  InvalidItemNameError,
  InvalidItemTypeError,
  ManifestRequiredError,
  ProposalBaseNotFoundError,
  ProposalRenameError,
  StaleFilesError,
  StartingFileError,
  SubmissionNotEditableError,
  SubmissionNotFoundError,
  TypeChangedError,
  ZipImportError,
} from "../exceptions/errors";
import { isEditable, type SubmissionStatus } from "../models/status";
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
import { draftTemplate, startingFiles } from "../models/templates";
import { readZip } from "../models/zip";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { frontmatterChanges } from "./frontmatter-dependencies";
import { requireMember, requireSignedIn } from "./membership";
import { staleVersion, withStale } from "./proposals";
import { registryIssues } from "./registry-checks";
import { noChangeIssues, removeSubmission } from "./submissions";

/**
 * Drafts (feature 012). Anyone signed in writes drafts of new items; a draft is visible only to its
 * author, so everyone else, root included, gets SubmissionNotFoundError. Drafts are private work in
 * progress, so the web's are not audited (a session is the person); 013 records submitting and
 * withdrawing. A draft uploaded with a token is (037), so a leaked token's work can be traced.
 */
export type DraftDeps = {
  repo: SubmissionRepository;
  now?: () => Date;
  limits?: PackageLimits;
  /** Where published versions are, to tell a proposal that changes nothing (042). */
  storage?: StorageAdapter;
};
export type DraftActor = { user: CurrentUser | null; ip?: string | null };

/** By code unit, as the repository returns them. */
const sortByPath = <T extends { path: string }>(files: T[]): T[] =>
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const now = (deps: DraftDeps) => (deps.now ?? (() => new Date()))();
const limitsOf = (deps: DraftDeps) => deps.limits ?? DEFAULT_LIMITS;

/**
 * The actor's own submission, or SubmissionNotFoundError: someone else's looks like a missing one.
 * Reading needs no membership: a removed member still reads their own (091).
 */
const ownSubmission = async (
  repo: SubmissionRepository,
  actor: DraftActor,
  id: string,
): Promise<Submission> => {
  requireSignedIn(actor);
  const submission = isId(id) ? await repo.find(id) : null;
  if (!submission || submission.authorId !== actor.user?.id) throw new SubmissionNotFoundError();
  return submission;
};

/**
 * The actor's own submission, if its files can be edited: a draft, or sent back for changes, in a
 * workspace they're still a member of (091).
 */
const ownEditable = async (repo: SubmissionRepository, actor: DraftActor, id: string) => {
  const submission = await ownSubmission(repo, actor, id);
  if (!isEditable(submission.status)) throw new SubmissionNotEditableError(submission.status);
  requireMember(actor, submission.workspace);
  return submission;
};

/** The actor's own draft: renaming and deleting stop once it's been submitted. */
const ownDraft = async (repo: SubmissionRepository, actor: DraftActor, id: string) => {
  const submission = await ownSubmission(repo, actor, id);
  if (submission.status !== "draft") throw new SubmissionNotEditableError();
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

/** Inserts a draft with its files; the caller runs it inside a transaction. */
const insertDraft = async (
  repo: SubmissionRepository,
  draft: {
    authorId: string;
    scope: { id: string; name: string; workspace: { id: string; name: string } };
    name: string;
    type: ItemType;
    files: DraftFile[];
    at: Date;
    /** For a change proposal (017, 042): the item and the version it starts from. */
    proposal?: { itemId: string; baseVersionId: string; baseVersion: string };
  },
): Promise<Draft> => {
  const { authorId, scope, name, type, at, proposal } = draft;
  const files = sortByPath(draft.files);
  const id = await repo.insert({
    authorId,
    scopeId: scope.id,
    name,
    type,
    status: "draft",
    createdAt: at,
    ...(proposal
      ? { proposal: { itemId: proposal.itemId, baseVersionId: proposal.baseVersionId } }
      : {}),
  });
  for (const file of files) await repo.writeFile(id, file);
  return {
    id,
    authorId,
    scope: { id: scope.id, name: scope.name },
    workspace: scope.workspace,
    name,
    type,
    status: "draft",
    createdAt: at,
    updatedAt: at,
    submittedAt: null,
    proposal: proposal ? { ...proposal, conflicts: [] } : null,
    files,
  };
};

const typeFrom = (value: string): ItemType => {
  if (!isItemType(value)) throw new InvalidItemTypeError(value);
  return value;
};

export const createDraft = async (
  deps: DraftDeps,
  actor: DraftActor,
  input: { scope: string; name: string; type: string },
): Promise<Draft> => {
  requireSignedIn(actor);
  const authorId = actor.user?.id ?? "";
  const name = itemNameFrom(input.name);
  const type = typeFrom(input.type);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const scope = await findScope(repo, input.scope);
    requireMember(actor, scope.workspace);
    const files = draftTemplate(type, itemNameOf({ scope, name })).map((file) => ({
      path: file.path,
      encoding: "utf8" as const,
      content: file.content,
      size: byteSize({ encoding: "utf8", content: file.content }),
      executable: file.executable ?? false,
      updatedAt: at,
    }));
    return insertDraft(repo, { authorId, scope, name, type, files, at });
  });
};

/** Your own drafts and submissions, newest change first, with the proposals that are stale (017). */
export const listMySubmissions = async (
  deps: DraftDeps,
  actor: DraftActor,
): Promise<(Submission & { stale: string | null })[]> => {
  requireSignedIn(actor);
  return withStale(deps.repo.registry(), await deps.repo.listByAuthor(actor.user?.id ?? ""));
};

export const MY_SUBMISSIONS_PAGE_SIZE = 50;

/** My submissions' view (063): a status (or all but archived), a search and a type, sorted. */
export type MySubmissionsQuery = {
  status?: SubmissionStatus;
  search?: string;
  type?: ItemType;
  sort?: "updated" | "name";
  dir?: SortDir;
  size?: number;
  cursor?: string;
};

export type MySubmissionsPage = {
  rows: (Submission & { stale: string | null })[];
  next: string | null;
  previous: string | null;
  total: { count: number; capped: boolean };
};

/** One page of your own submissions, with the stale proposals among them (017), and the total. */
export const pageMySubmissions = async (
  deps: DraftDeps,
  actor: DraftActor,
  query: MySubmissionsQuery,
): Promise<MySubmissionsPage> => {
  requireSignedIn(actor);
  const filters = {
    authorId: actor.user?.id ?? "",
    status: query.status,
    search: query.search?.trim().slice(0, 100) || undefined,
    type: query.type,
  };
  const sort = query.sort ?? "updated";
  const [page, total] = await Promise.all([
    deps.repo.pageByAuthor({
      ...filters,
      sort,
      dir: query.dir ?? (sort === "updated" ? "desc" : "asc"),
      size: query.size ?? MY_SUBMISSIONS_PAGE_SIZE,
      cursor: query.cursor,
    }),
    deps.repo.countByAuthor(filters),
  ]);
  return {
    rows: await withStale(deps.repo.registry(), page.rows),
    next: page.next,
    previous: page.previous,
    total,
  };
};

/** How many of your submissions are in each status, for My submissions' status links (063). */
export const countMySubmissionsByStatus = async (deps: DraftDeps, actor: DraftActor) => {
  requireSignedIn(actor);
  return deps.repo.statusCountsByAuthor(actor.user?.id ?? "");
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
/**
 * `rewritten`: the files the save changed besides what was sent (097: a skill's frontmatter quoted,
 * its agent added to `ronne.yaml`), so the editor can show them.
 */
export type SavedDraft = { draft: Draft; issues: ManifestIssue[]; rewritten: string[] };

/** What can be checked without the database, so a bad write touches nothing: the paths first. */
const checkPaths = (paths: readonly string[], what: string) => {
  const seen = new Set<string>();
  for (const path of paths) {
    const problem = pathProblem(path);
    if (problem) throw new InvalidFilePathError(path, problem);
    if (seen.has(path)) throw new InvalidFilePathError(path, `appears twice in one ${what}`);
    seen.add(path);
  }
};

/** Then each written file's content and size. */
const checkContent = (
  writes: readonly { path: string; encoding: "utf8" | "base64"; content: string }[],
  limits: PackageLimits,
) => {
  for (const file of writes) {
    if (file.encoding === "base64" && !isBase64(file.content))
      throw new InvalidFileContentError(file.path);
    const size = byteSize(file);
    if (size > limits.maxFileBytes)
      throw new FileTooLargeError(file.path, size, limits.maxFileBytes);
  }
};

const checkChanges = (changes: DraftChanges, limits: PackageLimits) => {
  checkPaths(
    [...changes.writes, ...changes.deletes].map((file) => file.path),
    "save",
  );
  if (changes.deletes.some((file) => file.path === MANIFEST_PATH))
    throw new ManifestRequiredError();
  checkContent(changes.writes, limits);
};

/** A delete (or the old path of a rename) of one of the type's starting files is refused. */
const checkStartingFiles = (changes: DraftChanges, type: ItemType) => {
  const starting = new Set(startingFiles(type));
  const removed = changes.deletes.find((file) => starting.has(file.path));
  if (removed) throw new StartingFileError(removed.path, type);
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
  const rewritten: string[] = [];
  const draft = await deps.repo.transaction(async (repo) => {
    const submission = await ownEditable(repo, actor, id);
    checkStartingFiles(changes, submission.type);
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

    // A skill's frontmatter: item names quoted, and its agent listed as a dependency (097).
    const fixed = await withFrontmatter(repo.registry(), submission.type, [...next.values()]);
    for (const path of fixed.rewritten) {
      const file = fixed.files.find((f) => f.path === path);
      if (!file) continue;
      const updated = { ...file, updatedAt: at };
      const index = written.findIndex((w) => w.path === path);
      if (index >= 0) written[index] = updated;
      else written.push(updated);
      next.set(path, updated);
      rewritten.push(path);
    }

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
  return { draft, issues: validateDraft(draft, draft.files, limits), rewritten };
};

/**
 * `files` with a skill's frontmatter quoted and its agent listed (097), and the paths that changed.
 * Runs inside the save's or upload's transaction, so the dependency's range is read once with it.
 */
const withFrontmatter = async <F extends DraftFile>(
  registry: RegistryLookup,
  type: ItemType,
  files: readonly F[],
): Promise<{ files: F[]; rewritten: string[] }> => {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const rewrites = await frontmatterChanges(registry, type, byPath);
  if (rewrites.size === 0) return { files: [...files], rewritten: [] };
  return {
    files: files.map((file) => {
      const content = rewrites.get(file.path);
      return content === undefined
        ? file
        : { ...file, content, size: byteSize({ encoding: file.encoding, content }) };
    }),
    rewritten: [...rewrites.keys()],
  };
};

/** The most drafts an author may have for the API to create another (037). */
export const MAX_API_DRAFTS = 50;

/** Who uploads: the token's user, the token, and the caller's address. */
export type UploadActor = DraftActor & { ip: string | null; token: { id: string; name: string } };

/**
 * An uploaded draft: 011's issues, and what Submit would refuse right now (013), as advice; for a
 * change proposal (042), the version it's based on and whether a newer one is out.
 */
export type UploadedDraft = SavedDraft & {
  submitIssues: ManifestIssue[];
  proposal: { item: string; baseVersion: string; stale: string | null } | null;
};

export type UploadFile = {
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  executable?: boolean;
};

/**
 * A draft of a new item with its files, in one transaction and with no template (037): what `rmk`
 * and the MCP server upload. Paths, content and limits are checked as a save checks them, before
 * anything is written. Like a save, a draft with errors is still created, and they're in `issues`.
 * Unlike the web form, an author with MAX_API_DRAFTS drafts is refused, and the draft is audited
 * with the token that made it: root reads the audit log, so root sees the draft's name. Nothing
 * is reserved or submitted: `submitIssues` only tells the client what Submit would refuse.
 */
export const createDraftFromFiles = async (
  deps: DraftDeps,
  actor: UploadActor,
  input: {
    scope: string;
    name: string;
    type: string;
    files: readonly UploadFile[];
    /** A published version of `@scope/name`: the draft is a change proposal to it (017, 042). */
    base?: string;
  },
): Promise<UploadedDraft> => {
  requireSignedIn(actor);
  const authorId = actor.user?.id ?? "";
  const name = itemNameFrom(input.name);
  const type = typeFrom(input.type);
  const limits = limitsOf(deps);
  const at = now(deps);
  const { files, count, bytes } = uploadedFiles(input.files, limits, at);
  const rewritten: string[] = [];

  const draft = await deps.repo.transaction(async (repo) => {
    const scope = await findScope(repo, input.scope);
    requireMember(actor, scope.workspace);
    const proposal =
      input.base === undefined
        ? undefined
        : await proposalBase(repo.registry(), `@${scope.name}/${name}`, type, input.base);
    if ((await repo.countDrafts(authorId)) >= MAX_API_DRAFTS)
      throw new DraftQuotaError(MAX_API_DRAFTS);
    const fixed = await withFrontmatter(repo.registry(), type, files);
    rewritten.push(...fixed.rewritten);
    const draft = await insertDraft(repo, {
      authorId,
      scope,
      name,
      type,
      files: fixed.files,
      at,
      proposal,
    });
    await repo.recordAudit(
      {
        actorId: authorId,
        action: "submission.draft_created",
        target: { type: "submission", id: draft.id },
        metadata: {
          name: itemNameOf(draft),
          type,
          via: "api",
          tokenId: actor.token.id,
          tokenName: actor.token.name,
          files: count,
          bytes,
          ...(proposal ? { proposal: true, baseVersion: proposal.baseVersion } : {}),
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return draft;
  });
  return uploaded(deps, draft, limits, rewritten);
};

/** An upload's files (037), checked as a save checks them, before anything is written. */
const uploadedFiles = (input: readonly UploadFile[], limits: PackageLimits, at: Date) => {
  checkPaths(
    input.map((file) => file.path),
    "upload",
  );
  if (!input.some((file) => file.path === MANIFEST_PATH))
    throw new ManifestRequiredError("missing");
  checkContent(input, limits);
  const files: DraftFile[] = input.map((file) => ({
    path: file.path,
    encoding: file.encoding,
    content: file.content,
    size: byteSize(file),
    executable: file.executable ?? false,
    updatedAt: at,
  }));
  const { count, bytes } = totals(files);
  if (count > limits.maxFiles) throw new DraftLimitError("files", count, limits.maxFiles);
  if (bytes > limits.maxTotalBytes) throw new DraftLimitError("total", bytes, limits.maxTotalBytes);
  return { files, count, bytes };
};

/** What the API answers for an uploaded draft: 011's issues, Submit's, and the proposal's base. */
const uploaded = async (
  deps: DraftDeps,
  draft: Draft,
  limits: PackageLimits,
  rewritten: string[],
): Promise<UploadedDraft> => {
  const registry = deps.repo.registry();
  return {
    draft,
    issues: validateDraft(draft, draft.files, limits),
    rewritten,
    submitIssues: [
      ...(await registryIssues(deps.repo, registry, draft, draft.files)),
      ...(draft.proposal && deps.storage
        ? await noChangeIssues({ storage: deps.storage, limits }, registry, draft, draft.files)
        : []),
    ],
    proposal: draft.proposal
      ? {
          item: itemNameOf(draft),
          baseVersion: draft.proposal.baseVersion,
          stale: await staleVersion(registry, draft),
        }
      : null,
  };
};

/** The statuses export looks for (051): the editable ones, and submitted ones it leaves alone. */
const OPEN_STATUSES: readonly SubmissionStatus[] = ["draft", "changes_requested", "submitted"];

/**
 * Your own drafts, submissions sent back for changes, and submissions in review (051), newest
 * change first; only those of `itemName` (`@scope/name`) when it's given. What `rmk export` looks
 * at to update a draft instead of making another.
 */
export const listOpenDrafts = async (
  deps: DraftDeps,
  actor: DraftActor,
  itemName?: string,
): Promise<(Submission & { description: string | null })[]> => {
  requireSignedIn(actor);
  const wanted = itemName?.trim().toLowerCase();
  const open = (await deps.repo.listByAuthor(actor.user?.id ?? "")).filter(
    (submission) =>
      OPEN_STATUSES.includes(submission.status) &&
      (wanted === undefined || itemNameOf(submission) === wanted),
  );
  // Each one's description (053): export keeps a draft's when the local item has none.
  const described = [];
  for (const submission of open) {
    const manifest = (await deps.repo.files(submission.id)).find((f) => f.path === MANIFEST_PATH);
    described.push({ ...submission, description: descriptionIn(manifest) });
  }
  return described;
};

/** The `description` in a draft's `ronne.yaml`, or null when it has none or can't be read. */
const descriptionIn = (manifest: DraftFile | undefined): string | null => {
  if (manifest?.encoding !== "utf8") return null;
  const doc = parseDocument(manifest.content);
  if (doc.errors.length > 0) return null;
  const value = doc.get("description");
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/**
 * Replaces the files of your own draft, or one sent back for changes, with an upload (051): what
 * `rmk export` does when you export an item again. The upload must be the same item: its name,
 * type, and for a change proposal its base version; otherwise DraftMismatchError. Every file not
 * in the upload is deleted. Checked as 037's upload is, audited as `submission.draft_updated`, and
 * not counted against the draft limit, since it makes no new draft.
 */
export const replaceDraftFromFiles = async (
  deps: DraftDeps,
  actor: UploadActor,
  id: string,
  input: {
    scope: string;
    name: string;
    type: string;
    files: readonly UploadFile[];
    base?: string;
  },
): Promise<UploadedDraft> => {
  requireSignedIn(actor);
  const name = itemNameFrom(input.name);
  const type = typeFrom(input.type);
  const limits = limitsOf(deps);
  const at = now(deps);
  const { files, count, bytes } = uploadedFiles(input.files, limits, at);
  const rewritten: string[] = [];

  const draft = await deps.repo.transaction(async (repo) => {
    const submission = await ownEditable(repo, actor, id);
    const baseVersion = submission.proposal?.baseVersion ?? null;
    if (
      normalizeScopeName(input.scope) !== submission.scope.name ||
      name !== submission.name ||
      type !== submission.type ||
      (input.base ?? null) !== baseVersion
    )
      throw new DraftMismatchError({
        name: itemNameOf(submission),
        type: submission.type,
        baseVersion,
      });
    const fixed = await withFrontmatter(repo.registry(), type, files);
    rewritten.push(...fixed.rewritten);
    const keep = new Set(fixed.files.map((file) => file.path));
    for (const file of await repo.files(submission.id))
      if (!keep.has(file.path)) await repo.deleteFile(submission.id, file.path);
    for (const file of fixed.files) await repo.writeFile(submission.id, file);
    await repo.update(submission.id, { updatedAt: at });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? "",
        action: "submission.draft_updated",
        target: { type: "submission", id: submission.id },
        metadata: {
          name: itemNameOf(submission),
          type,
          via: "api",
          tokenId: actor.token.id,
          tokenName: actor.token.name,
          files: count,
          bytes,
          status: submission.status,
          ...(baseVersion ? { proposal: true, baseVersion } : {}),
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return { ...submission, updatedAt: at, files: sortByPath(fixed.files) };
  });
  return uploaded(deps, draft, limits, rewritten);
};

/**
 * The item and version a proposal from the API starts from (042), checked as 017 checks one from
 * the item page: the item is published, the version exists (yanked ones too), and the type is the
 * item's.
 */
const proposalBase = async (
  registry: RegistryLookup,
  itemName: string,
  type: ItemType,
  version: string,
) => {
  const parsed = parseItemName(itemName);
  const item = parsed ? await registry.findItem(parsed.scope, parsed.name) : null;
  if (!item) throw new ProposalBaseNotFoundError(itemName);
  if (item.type !== type) throw new TypeChangedError(itemName, item.type, type);
  const base = (await registry.publishedVersions(item.id)).find((v) => v.version === version);
  if (!base) throw new ProposalBaseNotFoundError(itemName, version);
  return { itemId: item.id, baseVersionId: base.id, baseVersion: base.version };
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
  requireSignedIn(actor);
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
    // Replacing keeps the type's starting files the archive doesn't have (owner, 2026-10-01).
    deletes:
      input.mode === "replace"
        ? draft.files
            .filter(
              (file) => !paths.has(file.path) && !startingFiles(draft.type).includes(file.path),
            )
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
    if (submission.proposal) throw new ProposalRenameError();
    requireMember(actor, submission.workspace);
    const found = await findScope(repo, input.scope);
    requireMember(actor, found.workspace);
    const scope = { id: found.id, name: found.name };
    const renamed = { ...submission, scope, workspace: found.workspace, name, updatedAt: at };
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

/**
 * Removes a draft and its files for good, from its settings (012). Since 057 it's 057's delete:
 * refused once a reviewer has taken part (a draft restored from archived may have), and audited.
 */
export const deleteDraft = async (
  deps: DraftDeps,
  actor: DraftActor,
  id: string,
): Promise<void> => {
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await ownDraft(repo, actor, id);
    await repo.lockSubmission(id);
    await removeSubmission(repo, actor, await ownDraft(repo, actor, id), at);
  });
};
