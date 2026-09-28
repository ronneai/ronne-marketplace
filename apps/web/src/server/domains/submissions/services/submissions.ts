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
  fileBytes,
  itemNameOf,
  MANIFEST_PATH,
  type Submission,
  validateDraft,
} from "../models/submission";
import { type RegistryLookup, unreleasedRegistry } from "../repositories/registry-lookup";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { dependencyIssues, nameIssues } from "./registry-checks";

/**
 * Submitting and withdrawing (feature 013). The author submits a draft after every check a
 * reviewer would otherwise do by hand, or withdraws it until it's approved. Every status change
 * goes through `transition` (models/status.ts).
 */
export type SubmissionDeps = {
  repo: SubmissionRepository;
  /** Published items and versions; nothing until releases (015). */
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
const allIssues = async (
  deps: SubmissionDeps,
  repo: SubmissionRepository,
  submission: Submission,
): Promise<ManifestIssue[]> => {
  const files = await repo.files(submission.id);
  const issues = validateDraft(submission, files, deps.limits ?? DEFAULT_LIMITS);
  if (hasErrors(issues)) return issues;

  const registry = deps.registry ?? unreleasedRegistry;
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

/**
 * What submitting would say, without submitting: the submit dialog lists these first. Errors
 * block the submit; warnings are shown and allowed.
 */
export const checkSubmission = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<ManifestIssue[]> => {
  const submission = await own(deps.repo, actor, id);
  transition(submission.status, "submit");
  return allIssues(deps, deps.repo, submission);
};

/**
 * Sends a draft for review. The checks run on the saved files, inside the transaction that
 * changes the status, after locking the scope: two submissions of one name can't both pass.
 */
export const submitDraft = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Submission & { issues: ManifestIssue[] }> => {
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await own(repo, actor, id);
    const status = transition(submission.status, "submit");
    await repo.lockScope(submission.scope.id);
    const issues = await allIssues(deps, repo, submission);
    if (hasErrors(issues)) throw new SubmissionInvalidError(issues);

    await repo.setStatus(submission.id, status, { updatedAt: at, submittedAt: at });
    const manifestFile = (await repo.files(submission.id)).find((f) => f.path === MANIFEST_PATH);
    const manifest = manifestFile
      ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
      : null;
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "submission.submitted",
        target: { type: "submission", id: submission.id },
        metadata: {
          name: itemNameOf(submission),
          type: submission.type,
          dependencies: (manifest?.dependencies ?? {}) as Record<string, string>,
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return { ...submission, status, updatedAt: at, submittedAt: at, issues };
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
