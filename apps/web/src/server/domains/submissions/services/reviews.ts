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
  SubmissionsError,
} from "../exceptions/errors";
import type { ReviewEventKind } from "../models/review";
import {
  canTransition,
  OPEN_STATUSES,
  type SubmissionAction,
  type SubmissionStatus,
  transition,
} from "../models/status";
import { itemNameOf, type Submission } from "../models/submission";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { dependenciesOf, marksFor } from "./dependency-marks";
import { requireCurrent } from "./proposals";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/**
 * Review decisions and the conversation (feature 014). Moderators and root approve, request
 * changes or reject others' submissions; root approves its own only through an override, with an
 * optional reason (054). Every decision locks the submission's row, goes through `transition`, adds an event and
 * is audited, in one transaction.
 */

const now = (deps: SubmissionDeps) => (deps.now ?? (() => new Date()))();

/** A trimmed message, null when empty; ReviewMessageError when it's required or too long. */
export const messageFrom = (value: string | undefined, required: string | null): string | null => {
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
    // Optional since 054: it's still recorded as an override, with or without a reason.
    requires: null,
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
  input: {
    decision: ReviewDecision;
    message?: string;
    /** How it was decided, for the audit log: approving many at once (054), or a queue row (058). */
    via?: "bulk" | "queue";
    /** Why, when it follows another decision: its dependency was rejected (056). */
    cause?: { rejected: string };
  },
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
    // A stale proposal (017) is rebased before anyone approves it.
    if (decision.action === "approve")
      await requireCurrent(deps.registry ?? repo.registry(), submission);
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
        metadata: {
          name: itemNameOf(submission),
          revision,
          ...(message ? { message } : {}),
          ...(input.via ? { via: input.via } : {}),
          ...(input.cause ? { cause: input.cause } : {}),
        },
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

/** An open submission that depends on another one, not yet released (056). */
export type Dependent = {
  id: string;
  name: string;
  status: SubmissionStatus;
  authorName: string;
  /** Whether this reviewer can request changes on it; why not otherwise. */
  sendBack: { ok: true } | { ok: false; reason: string };
};

/** How many open submissions a page looks through for dependents: the queue's own limit. */
const DEPENDENTS_SCAN = 500;

/**
 * The open submissions that depend on this one's item with no matching release: what rejecting or
 * withdrawing it leaves waiting on nothing (056). Anyone who can see the submission may ask; the
 * names are shown to reviewers, and authors get only the count.
 */
export const dependentsOf = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<Dependent[]> => {
  const submission = isId(id) ? await deps.repo.find(id) : null;
  if (!submission) throw new SubmissionNotFoundError();
  const name = itemNameOf(submission);
  const registry = deps.registry ?? deps.repo.registry();
  const reviewer = can(actor.user, "submissions.review");
  const open = await deps.repo.listForReview({
    statuses: OPEN_STATUSES,
    order: "oldest",
    limit: DEPENDENTS_SCAN,
  });
  const found: Dependent[] = [];
  for (const other of open) {
    if (other.id === submission.id) continue;
    const range = (await dependenciesOf(deps.repo, other))[name];
    if (range === undefined) continue;
    if ((await marksFor(registry, { [name]: range })).length === 0) continue;
    const mine = other.authorId === actor.user?.id;
    found.push({
      id: other.id,
      name: itemNameOf(other),
      status: other.status,
      authorName: other.authorName,
      sendBack: !reviewer
        ? { ok: false, reason: "Only reviewers send submissions back." }
        : mine
          ? { ok: false, reason: "Yours: edit or withdraw it." }
          : canTransition(other.status, "request_changes")
            ? { ok: true }
            : { ok: false, reason: `It's ${other.status.replace("_", " ")}.` },
    });
  }
  return found;
};

export type SentBack = {
  id: string;
  name: string;
  result: "sent_back" | "skipped";
  reason?: string;
};

/**
 * Rejects a submission, then (056), when asked, requests changes on each open submission that
 * depends on it, each as its own decision in its own transaction, with `cause` in its audit event.
 * One that can't be sent back (the reviewer's own, or one that moved on) is skipped and said.
 */
export const rejectWithDependents = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
  input: { message?: string; dependents?: { message?: string }; via?: "queue" },
): Promise<{ rejected: Submission; dependents: SentBack[] }> => {
  const waiting = input.dependents ? await dependentsOf(deps, actor, id) : [];
  const dependentsMessage = input.dependents
    ? messageFrom(input.dependents.message, "Sending its dependents back")
    : null;
  const rejected = await decide(deps, actor, id, {
    decision: "reject",
    message: input.message,
    ...(input.via ? { via: input.via } : {}),
  });
  const results: SentBack[] = [];
  for (const dependent of waiting) {
    if (!dependent.sendBack.ok) {
      results.push({
        id: dependent.id,
        name: dependent.name,
        result: "skipped",
        reason: dependent.sendBack.reason,
      });
      continue;
    }
    try {
      await decide(deps, actor, dependent.id, {
        decision: "request_changes",
        message: dependentsMessage ?? undefined,
        cause: { rejected: id },
      });
      results.push({ id: dependent.id, name: dependent.name, result: "sent_back" });
    } catch (error) {
      if (!(error instanceof SubmissionsError)) throw error;
      results.push({
        id: dependent.id,
        name: dependent.name,
        result: "skipped",
        reason: error.message,
      });
    }
  }
  return { rejected, dependents: results };
};
