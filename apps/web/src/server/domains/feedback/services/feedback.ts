import { isId } from "../../../db/ids";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import { requirePermission } from "../../identity/models/permissions";
import type { FavoriteActor as FeedbackActor } from "../../shelves/services/favorites";
import { FeedbackError, FeedbackLimitError, InvalidFeedbackError } from "../exceptions/errors";
import { checkFeedback, FEEDBACK_PER_HOUR, type FeedbackEntry } from "../models/feedback";
import type {
  FeedbackFilters,
  FeedbackPageQuery,
  FeedbackRepository,
} from "../repositories/feedback-repository";
import type { FeedbackLimiter } from "./feedback-limiter";

/**
 * Feedback to the instance's administrators (feature 127). Anyone signed in sends it; only root
 * reads it, marks it handled and deletes it, checked here on the server before anything else. The
 * text of a message never goes to the audit log or a log line: events carry ids only.
 */
export type FeedbackDeps = {
  feedback: FeedbackRepository;
  limiter: FeedbackLimiter;
  /** The app's version, stored with each message. */
  version: string;
  now?: () => Date;
};

export type { FeedbackActor };

/** The most rows one bulk action takes: a page of the table. */
export const FEEDBACK_BULK_MAX = 100;

const now = (deps: FeedbackDeps) => (deps.now ?? (() => new Date()))();

const requireManage = (actor: FeedbackActor) => requirePermission(actor.user, "feedback.manage");

/**
 * Stores what a signed-in person wrote. Refused, with the reason, when the form isn't filled in
 * right (that doesn't count against the limit), and when they have sent 10 in the hour.
 */
export const sendFeedback = async (
  deps: FeedbackDeps,
  actor: FeedbackActor,
  input: { kind: unknown; message: unknown; page?: unknown },
): Promise<void> => {
  requirePermission(actor.user, "account.manage_own");
  const user = actor.user;
  if (!user) return;
  const checked = checkFeedback(input);
  if (!checked.ok) throw new InvalidFeedbackError(checked.problem);
  if (!deps.limiter.consume(user.id).allowed) throw new FeedbackLimitError(FEEDBACK_PER_HOUR);
  await deps.feedback.insert(user.id, checked.feedback, {
    version: deps.version,
    at: now(deps),
  });
};

/** Root's inbox: one page. */
export const listFeedback = async (
  deps: FeedbackDeps,
  actor: FeedbackActor,
  query: FeedbackPageQuery,
) => {
  requireManage(actor);
  return deps.feedback.page(query);
};

export const countFeedback = async (
  deps: FeedbackDeps,
  actor: FeedbackActor,
  filters: FeedbackFilters,
) => {
  requireManage(actor);
  return deps.feedback.count(filters);
};

/** One message, for the detail dialog; null when there is none. */
export const findFeedback = async (
  deps: FeedbackDeps,
  actor: FeedbackActor,
  id: string,
): Promise<FeedbackEntry | null> => {
  requireManage(actor);
  return isId(id) ? deps.feedback.find(id) : null;
};

/** How many are still new, for the sidebar's count. */
export const countNewFeedback = async (deps: FeedbackDeps, actor: FeedbackActor) => {
  requireManage(actor);
  return deps.feedback.countNew();
};

/** The ids asked for, once each; anything that isn't an id is dropped, too many is refused. */
const idsOf = (ids: readonly string[]): string[] => {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && isId(id)))];
  if (unique.length > FEEDBACK_BULK_MAX)
    throw new FeedbackError(`Select at most ${FEEDBACK_BULK_MAX} messages.`);
  return unique;
};

const eventOf =
  (actor: FeedbackActor, action: "feedback.handled" | "feedback.deleted") =>
  (id: string): NewAuditEvent => ({
    actorId: actor.user?.id ?? null,
    action,
    target: { type: "feedback", id },
    ipAddress: actor.ip,
  });

/** Marks the selected messages handled; returns the ids that changed (those that were new). */
export const markFeedbackHandled = async (
  deps: FeedbackDeps,
  actor: FeedbackActor,
  ids: readonly string[],
): Promise<string[]> => {
  requireManage(actor);
  return deps.feedback.markHandled(idsOf(ids), {
    by: actor.user?.id as string,
    at: now(deps),
    audit: eventOf(actor, "feedback.handled"),
  });
};

/** Deletes the selected messages; returns the ids that existed. */
export const deleteFeedback = async (
  deps: FeedbackDeps,
  actor: FeedbackActor,
  ids: readonly string[],
): Promise<string[]> => {
  requireManage(actor);
  return deps.feedback.remove(idsOf(ids), {
    at: now(deps),
    audit: eventOf(actor, "feedback.deleted"),
  });
};
