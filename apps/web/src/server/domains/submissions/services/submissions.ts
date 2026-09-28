import {
  DEFAULT_LIMITS,
  hasErrors,
  type ManifestIssue,
  type PackageLimits,
  parseManifest,
} from "@ronneai/core";
import { isId } from "../../../db/ids";
import { can, requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { SubmissionInvalidError, SubmissionNotFoundError } from "../exceptions/errors";
import { OPEN_STATUSES, transition } from "../models/status";
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
import { dependencyIssues, nameIssues } from "./registry-checks";

/**
 * Submitting and withdrawing (feature 013). The author submits a draft after every check a
 * reviewer would otherwise do by hand, or withdraws it until it's approved. Every status change
 * goes through `transition` (models/status.ts).
 */
export type SubmissionDeps = {
  repo: SubmissionRepository;
  /** Published items and versions, for tests; by default the repository's own (015). */
  registry?: RegistryLookup;
  now?: () => Date;
  limits?: PackageLimits;
};
export type SubmissionActor = { user: CurrentUser | null; ip: string | null };

const now = (deps: SubmissionDeps) => (deps.now ?? (() => new Date()))();

const find = async (repo: SubmissionRepository, id: string) =>
  (isId(id) ? await repo.find(id) : null) ?? null;

/** The actor's own submission, in any status, or SubmissionNotFoundError. */
const own = async (repo: SubmissionRepository, actor: SubmissionActor, id: string) => {
  requirePermission(actor.user, "submissions.create");
  const submission = await find(repo, id);
  if (!submission || submission.authorId !== actor.user?.id) throw new SubmissionNotFoundError();
  return submission;
};

/**
 * A submission and its files, for the editor or a read-only view. The author always sees their
 * own; moderators and root (`submissions.view_submitted`) see any that isn't a draft. Anyone else
 * gets SubmissionNotFoundError, so a draft's existence isn't revealed.
 */
export const viewSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Draft & { mine: boolean }> => {
  requirePermission(actor.user, "submissions.create");
  const submission = await find(deps.repo, id);
  const mine = submission?.authorId === actor.user?.id;
  if (
    !submission ||
    !(mine || (submission.status !== "draft" && can(actor.user, "submissions.view_submitted")))
  )
    throw new SubmissionNotFoundError();
  return { ...submission, files: await deps.repo.files(submission.id), mine };
};

/** 011's checks on the saved files, then the registry checks. */
export const allIssues = async (
  deps: SubmissionDeps,
  repo: SubmissionRepository,
  submission: Submission,
  /** The files to check: the saved ones by default, or a revision's (the review page, 014). */
  given?: readonly Omit<DraftFile, "updatedAt">[],
): Promise<ManifestIssue[]> => {
  const files = given ?? (await repo.files(submission.id));
  const issues = validateDraft(submission, files, deps.limits ?? DEFAULT_LIMITS);
  if (hasErrors(issues)) return issues;

  // A test may pass its own; otherwise the repository's, on the caller's connection.
  const registry = deps.registry ?? repo.registry();
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
    : null;
  const dependencies = (manifest?.dependencies ?? {}) as Record<string, string>;
  return [
    ...issues,
    ...(await nameIssues(registry, {
      scope: submission.scope.name,
      name: submission.name,
      proposedElsewhere: await repo.isNameProposed(
        submission.scope.id,
        submission.name,
        OPEN_STATUSES,
        submission.id,
      ),
    })),
    ...(await dependencyIssues(registry, {
      itemName: itemNameOf(submission),
      type: submission.type,
      dependencies,
    })),
  ];
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
  const submission = await own(deps.repo, actor, id);
  transition(submission.status, sendAction(submission.status));
  return allIssues(deps, deps.repo, submission);
};

/**
 * Sends a draft for review, or a submission sent back for changes for another look (014). The
 * checks run on the saved files, inside the transaction that changes the status, after locking the
 * scope: two submissions of one name can't both pass. The files are snapshotted as the next
 * revision, which reviewers read and a release packs, and the conversation records it.
 */
export const submitDraft = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Submission & { issues: ManifestIssue[]; revision: number }> => {
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await own(repo, actor, id);
    const action = sendAction(submission.status);
    const status = transition(submission.status, action);
    await repo.lockScope(submission.scope.id);
    const issues = await allIssues(deps, repo, submission);
    if (hasErrors(issues)) throw new SubmissionInvalidError(issues);

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
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return {
      ...submission,
      status,
      updatedAt: at,
      submittedAt,
      issues,
      revision: revision.number,
    };
  });
};

/**
 * Withdraws a submission that isn't approved yet (owner decision, 2026-09-27). It's final: the
 * submission stays, read-only, for history.
 */
export const withdrawSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Submission> => {
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await own(repo, actor, id);
    const status = transition(submission.status, "withdraw");
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
        metadata: { name: itemNameOf(submission), from: submission.status },
        ipAddress: actor.ip,
      },
      at,
    );
    return { ...submission, status, updatedAt: at };
  });
};
