import {
  DEFAULT_LIMITS,
  hasErrors,
  type ManifestIssue,
  type PackageLimits,
  parseManifest,
} from "@ronneai/core";
import { isId } from "../../../db/ids";
import type { StorageAdapter } from "../../../storage";
import { can } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  HasReviewHistoryError,
  InvalidStatusTransitionError,
  SubmissionInvalidError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import { isUnreleased } from "../models/diff";
import { type SubmissionStatus, transition } from "../models/status";
import {
  type Draft,
  type DraftFile,
  fileBytes,
  itemNameOf,
  MANIFEST_PATH,
  type Submission,
  validateDraft,
} from "../models/submission";
import type { RegistryLookup } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { requireMember, requireSignedIn } from "./membership";
import { baseFilesOf } from "./proposals";
import { registryIssues } from "./registry-checks";
import { type CheckedMember, checkGroup, submitGroups } from "./submit-group";

/**
 * Submitting and withdrawing (feature 013). The author submits a draft after every check a
 * reviewer would otherwise do by hand, or withdraws it until it's released. Every status change
 * goes through `transition` (models/status.ts).
 */
export type SubmissionDeps = {
  repo: SubmissionRepository;
  /** Published items and versions, for tests; by default the repository's own (015). */
  registry?: RegistryLookup;
  /** Where artifacts are, to compare a change proposal with its base version (017). */
  storage?: StorageAdapter;
  now?: () => Date;
  limits?: PackageLimits;
};
export type SubmissionActor = {
  user: CurrentUser | null;
  ip: string | null;
  /** The access token, when it came through the API (052): the audit event names it. */
  token?: { id: string; name: string };
};

const now = (deps: SubmissionDeps) => (deps.now ?? (() => new Date()))();

const find = async (repo: SubmissionRepository, id: string) =>
  (isId(id) ? await repo.find(id) : null) ?? null;

/**
 * The actor's own submission, in any status, or SubmissionNotFoundError. Reading, withdrawing and
 * deleting your own need no membership (091); submitting and restoring check it.
 */
const own = async (repo: SubmissionRepository, actor: SubmissionActor, id: string) => {
  requireSignedIn(actor);
  const submission = await find(repo, id);
  if (!submission || submission.authorId !== actor.user?.id) throw new SubmissionNotFoundError();
  return submission;
};

/** What My submissions says under a row sent back or rejected (058). */
export type RowFeedback = { kind: "request_changes" | "reject"; by: string; body: string | null };

/**
 * The latest reviewer message on each of the actor's own submissions that was sent back or
 * rejected (058), by id, read in one query for the whole list.
 */
export const latestFeedbackFor = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  submissions: readonly Submission[],
): Promise<Record<string, RowFeedback>> => {
  requireSignedIn(actor);
  const ids = submissions
    .filter(
      (s) =>
        s.authorId === actor.user?.id &&
        (s.status === "changes_requested" || s.status === "rejected"),
    )
    .map((s) => s.id);
  const latest = await deps.repo.latestEvents(ids, ["request_changes", "reject"]);
  return Object.fromEntries(
    [...latest].map(([id, event]) => [
      id,
      {
        kind: event.kind as RowFeedback["kind"],
        by: event.actor.name,
        body: event.body,
      },
    ]),
  );
};

/** Only the author sees these: a draft, and an archived submission (057). */
const PRIVATE_STATUSES: readonly SubmissionStatus[] = ["draft", "withdrawn"];

/**
 * A submission and its files, for the editor or a read-only view. The author always sees their
 * own; moderators and root (`submissions.view_submitted`) see any that isn't a draft or archived
 * (057). Anyone else gets SubmissionNotFoundError, so a draft's existence isn't revealed.
 */
export const viewSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Draft & { mine: boolean; member: boolean }> => {
  requireSignedIn(actor);
  const submission = await find(deps.repo, id);
  const mine = submission?.authorId === actor.user?.id;
  if (
    !submission ||
    !(
      mine ||
      (!PRIVATE_STATUSES.includes(submission.status) &&
        can(actor.user, "submissions.view_submitted", submission.workspace.id))
    )
  )
    throw new SubmissionNotFoundError();
  return {
    ...submission,
    files: await deps.repo.files(submission.id),
    mine,
    // Whether the viewer may still change it: a removed member reads and withdraws only (091).
    member: can(actor.user, "submissions.create", submission.workspace.id),
  };
};

/** 011's checks on the saved files, then the registry checks. */
export const allIssues = async (
  deps: SubmissionDeps,
  repo: SubmissionRepository,
  submission: Submission,
  /** The files to check: the saved ones by default, or a revision's (the review page, 014). */
  given?: readonly Omit<DraftFile, "updatedAt">[],
  /** At release (015), every dependency has to be released, not only on its way (056). */
  options: { release?: boolean } = {},
): Promise<ManifestIssue[]> => {
  const files = given ?? (await repo.files(submission.id));
  const issues = validateDraft(submission, files, deps.limits ?? DEFAULT_LIMITS);
  if (hasErrors(issues)) return issues;

  // A test may pass its own; otherwise the repository's, on the caller's connection.
  const registry = deps.registry ?? repo.registry();
  return [
    ...issues,
    // A proposal (017) that changes nothing has nothing to release.
    ...(submission.proposal && deps.storage
      ? await noChangeIssues(
          { storage: deps.storage, limits: deps.limits },
          registry,
          submission,
          files,
        )
      : []),
    // Files a rebase (017) left in conflict, until the author resolves them.
    ...(submission.proposal?.conflicts ?? []).map(
      (path): ManifestIssue => ({
        severity: "error",
        code: "rebase_conflict",
        message: `${path} changed both in this proposal and in ${submission.proposal?.baseVersion}: compare them, make it right, then mark it resolved.`,
        file: path,
      }),
    ),
    ...(await registryIssues(repo, registry, submission, files, options)),
  ];
};

/** A proposal (017) whose files are its base version's: there's nothing to release. */
export const noChangeIssues = async (
  deps: { storage: StorageAdapter; limits?: PackageLimits },
  registry: RegistryLookup,
  submission: Submission,
  files: readonly Omit<DraftFile, "updatedAt">[],
): Promise<ManifestIssue[]> => {
  const base = await baseFilesOf(deps, registry, submission);
  const key = (f: Omit<DraftFile, "updatedAt">) =>
    `${f.path}\u0000${f.encoding}\u0000${f.executable}\u0000${f.content}`;
  // What would be released: a canvas layout under `.ronne/` (031) is no change to the item.
  const mine = files.filter((f) => !isUnreleased(f.path));
  const same =
    base !== null &&
    base.length === mine.length &&
    base.map(key).sort().join("\u0001") === mine.map(key).sort().join("\u0001");
  return same
    ? [
        {
          severity: "error",
          code: "no_changes",
          message: `No changes to ${submission.proposal?.baseVersion}: change something before submitting.`,
          file: MANIFEST_PATH,
        },
      ]
    : [];
};

/** Submit for a draft, resubmit for one sent back for changes (014). */
const sendAction = (status: Submission["status"]) =>
  status === "changes_requested" ? ("resubmit" as const) : ("submit" as const);

/**
 * What submitting (or resubmitting) would say, without doing it: the submit dialog lists these
 * first. Errors block it; warnings are shown and allowed.
 */
export const checkSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<ManifestIssue[]> => {
  const { members } = await checkSubmitGroup(deps, actor, id);
  const member = members.find((m) => m.id === id);
  return member && "issues" in member ? member.issues : [];
};

/**
 * What submitting the item would send (112): the item and the person's own drafts it needs, each
 * with its checks as if they were all in review, dependencies first, and what brings each in.
 */
export const checkSubmitGroup = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<{ ready: boolean; members: CheckedMember[]; neededBy: Map<string, string[]> }> => {
  const submission = await own(deps.repo, actor, id);
  transition(submission.status, sendAction(submission.status));
  requireMember(actor, submission.workspace);
  const [group] = await submitGroups(deps.repo, actor, [id]);
  const checked = await checkGroup(deps, deps.repo, actor, group?.ids ?? [id], groupCheck);
  return { ...checked, neededBy: group?.neededBy ?? new Map() };
};

/**
 * A group member's checks: 013's. The group's drafts count as in review (`checkGroup`); a draft
 * of the person's that isn't in the group stops it (112).
 */
const groupCheck = (deps: SubmissionDeps, repo: SubmissionRepository, submission: Submission) =>
  allIssues(deps, repo, submission);

/** One member sent for review: its status, a revision, the event and the audit record. */
const send = async (
  repo: SubmissionRepository,
  actor: SubmissionActor,
  submission: Submission,
  at: Date,
) => {
  const action = sendAction(submission.status);
  const status = transition(submission.status, action);
  const files = await repo.files(submission.id);
  const submittedAt = submission.submittedAt ?? at;
  await repo.setStatus(submission.id, status, { updatedAt: at, submittedAt });
  const revision = await repo.createRevision(submission.id, actor.user?.id ?? "", files, at);
  await repo.addEvent({
    submissionId: submission.id,
    actorId: actor.user?.id ?? "",
    kind: action,
    body: null,
    revision: revision.number,
    createdAt: at,
  });
  const manifestFile = files.find((f) => f.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
    : null;
  await repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action: action === "submit" ? "submission.submitted" : "submission.resubmitted",
      target: { type: "submission", id: submission.id },
      metadata: {
        name: itemNameOf(submission),
        type: submission.type,
        revision: revision.number,
        dependencies: (manifest?.dependencies ?? {}) as Record<string, string>,
        ...(actor.token
          ? { via: "api", tokenId: actor.token.id, tokenName: actor.token.name }
          : {}),
      },
      ipAddress: actor.ip,
    },
    at,
  );
  return { ...submission, status, updatedAt: at, submittedAt, revision: revision.number };
};

/** A member as a group's submit leaves it (112). */
export type SentMember = Submission & { issues: ManifestIssue[]; revision: number };

/**
 * Sends a group for review in the caller's transaction (112): every member checked as if all were
 * in review, then all of them sent, or, if one can't go, none, with each member's outcome.
 */
export const sendGroup = async (
  deps: SubmissionDeps,
  repo: SubmissionRepository,
  actor: SubmissionActor,
  ids: readonly string[],
  at: Date,
  /** What was asked for; the rest was brought in, and leaves the group if it's on its way now. */
  requested: ReadonlySet<string> = new Set(ids),
): Promise<{ ok: true; sent: SentMember[] } | { ok: false; members: CheckedMember[] }> => {
  // The scopes, locked in one order, so two groups sharing a scope don't wait on each other.
  const scopes = new Set<string>();
  for (const id of ids) {
    const found = isId(id) ? await repo.find(id) : null;
    if (found) scopes.add(found.scope.id);
  }
  for (const scope of [...scopes].sort()) await repo.lockScope(scope);
  // Locked now: a draft brought in that someone (another tab) sent meanwhile is on its way, and
  // what needs it counts it so; it isn't sent twice.
  const live: string[] = [];
  for (const id of ids) {
    const found = isId(id) ? await repo.find(id) : null;
    if (requested.has(id) || found?.status === "draft") live.push(id);
  }
  const checked = await checkGroup(deps, repo, actor, live, groupCheck);
  if (!checked.ready) return { ok: false, members: checked.members };
  const sent: SentMember[] = [];
  for (const member of checked.members)
    if (member.result === "ready")
      sent.push({ ...(await send(repo, actor, member.submission, at)), issues: member.issues });
  return { ok: true, sent };
};

/**
 * Submits the draft (or resubmits one sent back), with the person's own drafts it needs (112), in
 * one transaction: all of them, or, when one isn't ready, none. `with` lists the others it sent.
 */
export const submitDraft = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<SentMember & { with: SentMember[] }> => {
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await own(repo, actor, id);
    transition(submission.status, sendAction(submission.status));
    requireMember(actor, submission.workspace);
    const [group] = await submitGroups(repo, actor, [id]);
    const result = await sendGroup(deps, repo, actor, group?.ids ?? [id], at, new Set([id]));
    if (!result.ok) {
      // The item itself: gone or sent meanwhile (another tab), or its group isn't ready.
      const member = result.members.find((m) => m.id === id);
      if (!member || member.result === "not_found") throw new SubmissionNotFoundError();
      if (member.result === "not_submittable")
        throw new InvalidStatusTransitionError(
          member.submission.status,
          sendAction(member.submission.status),
        );
      throw new SubmissionInvalidError(member.issues);
    }
    const item = result.sent.find((m) => m.id === id);
    if (!item) throw new SubmissionNotFoundError();
    return { ...item, with: result.sent.filter((m) => m.id !== id) };
  });
};

/** What deleting for good may remove (057): anything not yet approved, archived included. */
const DELETABLE: readonly SubmissionStatus[] = [
  "draft",
  "submitted",
  "changes_requested",
  "withdrawn",
];

/**
 * Whether someone other than the author took part (057): a reviewer's comment or decision. Such a
 * submission can only be archived, so the conversation is kept.
 */
export const hasReviewHistory = async (
  repo: SubmissionRepository,
  submission: Submission,
): Promise<boolean> =>
  (await repo.events(submission.id)).some((event) => event.actor.id !== submission.authorId);

/** Whether the author may delete it for good now (057), for the pages' buttons. */
export const isDeletable = async (
  repo: SubmissionRepository,
  submission: Submission,
): Promise<boolean> =>
  DELETABLE.includes(submission.status) && !(await hasReviewHistory(repo, submission));

/** Whether the actor's own submission can be deleted for good now (057), for its page. */
export const canDeleteSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<boolean> => isDeletable(deps.repo, await own(deps.repo, actor, id));

/**
 * Removes the author's submission for good, with its files, revisions and conversation (the
 * foreign keys cascade), and records `submission.deleted`; the audit row stays. Call it inside a
 * transaction, with the row locked: it checks the status and the review history again.
 */
export const removeSubmission = async (
  repo: SubmissionRepository,
  actor: { user: CurrentUser | null; ip?: string | null },
  submission: Submission,
  at: Date,
): Promise<void> => {
  if (!DELETABLE.includes(submission.status))
    throw new InvalidStatusTransitionError(submission.status, "delete");
  if (await hasReviewHistory(repo, submission)) throw new HasReviewHistoryError();
  await repo.delete(submission.id);
  await repo.recordAudit(
    {
      actorId: actor.user?.id ?? null,
      action: "submission.deleted",
      target: { type: "submission", id: submission.id },
      metadata: { name: itemNameOf(submission), from: submission.status },
      ipAddress: actor.ip ?? null,
    },
    at,
  );
};

/**
 * Withdraws a submission that isn't approved yet (owner decision, 2026-09-27). Since 057 the
 * author chooses: `archive` keeps it, private to them and restorable; `delete` removes it for good,
 * when no reviewer has taken part.
 */
export const withdrawSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
  mode: "archive" | "delete" = "archive",
): Promise<Submission> => {
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    await own(repo, actor, id);
    await repo.lockSubmission(id);
    const submission = await own(repo, actor, id);
    const status = transition(submission.status, "withdraw");
    if (mode === "delete") {
      await removeSubmission(repo, actor, submission, at);
      return { ...submission, updatedAt: at };
    }
    await repo.setStatus(submission.id, status, { updatedAt: at });
    const latest = (await repo.revisions(submission.id)).at(-1);
    await repo.addEvent({
      submissionId: submission.id,
      actorId: actor.user?.id ?? "",
      kind: "withdraw",
      body: null,
      revision: latest?.number ?? null,
      createdAt: at,
    });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "submission.withdrawn",
        target: { type: "submission", id: submission.id },
        metadata: { name: itemNameOf(submission), from: submission.status, mode: "archive" },
        ipAddress: actor.ip,
      },
      at,
    );
    return { ...submission, status, updatedAt: at };
  });
};

/** Deletes the author's submission for good (057): from an archived one, or a draft. */
export const deleteSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<void> => {
  const at = now(deps);
  await deps.repo.transaction(async (repo) => {
    await own(repo, actor, id);
    await repo.lockSubmission(id);
    await removeSubmission(repo, actor, await own(repo, actor, id), at);
  });
};

/**
 * Brings an archived submission back as a draft (057), with its files, revisions and
 * conversation; the next submit is its next revision. As a draft, it doesn't hold its name.
 */
export const restoreSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Submission> => {
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    await own(repo, actor, id);
    await repo.lockSubmission(id);
    const submission = await own(repo, actor, id);
    const status = transition(submission.status, "restore");
    requireMember(actor, submission.workspace);
    await repo.setStatus(submission.id, status, { updatedAt: at });
    const latest = (await repo.revisions(submission.id)).at(-1);
    await repo.addEvent({
      submissionId: submission.id,
      actorId: actor.user?.id ?? "",
      kind: "restore",
      body: null,
      revision: latest?.number ?? null,
      createdAt: at,
    });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "submission.restored",
        target: { type: "submission", id: submission.id },
        metadata: { name: itemNameOf(submission) },
        ipAddress: actor.ip,
      },
      at,
    );
    return { ...submission, status, updatedAt: at };
  });
};
