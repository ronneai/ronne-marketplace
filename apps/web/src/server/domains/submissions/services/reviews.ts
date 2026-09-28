import { isId } from "../../../db/ids";
import type { AuditAction } from "../../audit/models/audit-event";
import { can, requirePermission } from "../../identity/models/permissions";
import {
  ConversationClosedError,
  OverrideNotNeededError,
  OwnSubmissionError,
  REVIEW_MESSAGE_MAX_LENGTH,
  ReviewMessageError,
  SubmissionNotFoundError,
} from "../exceptions/errors";
import type { ReviewEventKind } from "../models/review";
import { OPEN_STATUSES, type SubmissionAction, transition } from "../models/status";
import { itemNameOf, type Submission } from "../models/submission";
import type { SubmissionRepository } from "../repositories/submission-repository";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/**
 * Review decisions and the conversation (feature 014). Moderators and root approve, request
 * changes or reject others' submissions; root approves its own only through an override with a
 * reason. Every decision locks the submission's row, goes through `transition`, adds an event and
 * is audited, in one transaction.
 */

const now = (deps: SubmissionDeps) => (deps.now ?? (() => new Date()))();

const messageFrom = (value: string | undefined, required: string | null): string | null => {
  const message = (value ?? "").trim();
  if (!message) {
    if (required) throw new ReviewMessageError("required", required);
    return null;
  }
  if ([...message].length > REVIEW_MESSAGE_MAX_LENGTH) throw new ReviewMessageError("too_long", "");
  return message;
};

/** A submission this actor may see, found after locking its row. */
const lockedSubmission = async (
  repo: SubmissionRepository,
  actor: SubmissionActor,
  id: string,
): Promise<Submission> => {
  if (!isId(id)) throw new SubmissionNotFoundError();
  await repo.lockSubmission(id);
  const submission = await repo.find(id);
  const mine = submission?.authorId === actor.user?.id;
  if (
    !submission ||
    !(mine || (submission.status !== "draft" && can(actor.user, "submissions.view_submitted")))
  )
    throw new SubmissionNotFoundError();
  return submission;
};

const latestRevision = async (repo: SubmissionRepository, submissionId: string) =>
  (await repo.revisions(submissionId)).at(-1)?.number ?? null;

type Decision = {
  action: SubmissionAction;
  kind: ReviewEventKind;
  audit: AuditAction;
  /** What the message is for, when one is required. */
  requires: string | null;
};

const DECISIONS = {
  approve: {
    action: "approve",
    kind: "approve",
    audit: "submission.approved",
    requires: null,
  },
  request_changes: {
    action: "request_changes",
    kind: "request_changes",
    audit: "submission.changes_requested",
    requires: "Requesting changes",
  },
  reject: {
    action: "reject",
    kind: "reject",
    audit: "submission.rejected",
    requires: "Rejecting",
  },
  override: {
    action: "approve",
    kind: "override",
    audit: "submission.override_approved",
    requires: "Approving your own submission",
  },
} as const satisfies Record<string, Decision>;

export type ReviewDecision = keyof typeof DECISIONS;

/**
 * Approve, request changes, reject, or (root, on its own submission) override. Reviewers can't
 * decide on their own submissions; the override is only for them, and only for root.
 */
export const decide = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
  input: { decision: ReviewDecision; message?: string },
): Promise<Submission> => {
  const decision = DECISIONS[input.decision];
  requirePermission(
    actor.user,
    input.decision === "override" ? "submissions.override" : "submissions.review",
  );
  const message = messageFrom(input.message, decision.requires);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await lockedSubmission(repo, actor, id);
    const mine = submission.authorId === actor.user?.id;
    if (input.decision === "override" && !mine) throw new OverrideNotNeededError();
    if (input.decision !== "override" && mine)
      throw new OwnSubmissionError(can(actor.user, "submissions.override"));
    const status = transition(submission.status, decision.action);
    await repo.setStatus(submission.id, status, { updatedAt: at });
    const revision = await latestRevision(repo, submission.id);
    await repo.addEvent({
      submissionId: submission.id,
      actorId: actor.user?.id ?? "",
      kind: decision.kind,
      body: message,
      revision,
      createdAt: at,
    });
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: decision.audit,
        target: { type: "submission", id: submission.id },
        metadata: { name: itemNameOf(submission), revision, ...(message ? { message } : {}) },
        ipAddress: actor.ip,
      },
      at,
    );
    return { ...submission, status, updatedAt: at };
  });
};

/**
 * Adds a comment. Reviewers comment on any submission under review; the author on their own. Drafts
 * and closed submissions have no conversation. Comments aren't audited: the thread is their record,
 * and it can't be edited.
 */
export const comment = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
  input: { body: string },
): Promise<string> => {
  requirePermission(actor.user, "submissions.create");
  const body = messageFrom(input.body, "A comment") ?? "";
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const submission = await lockedSubmission(repo, actor, id);
    const mine = submission.authorId === actor.user?.id;
    if (!mine && !can(actor.user, "submissions.review")) throw new SubmissionNotFoundError();
    if (!OPEN_STATUSES.includes(submission.status)) throw new ConversationClosedError();
    return repo.addEvent({
      submissionId: submission.id,
      actorId: actor.user?.id ?? "",
      kind: "comment",
      body,
      revision: await latestRevision(repo, submission.id),
      createdAt: at,
    });
  });
};
