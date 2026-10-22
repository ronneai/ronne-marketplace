import { version } from "../../../../../package.json";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyFeedbackRepository } from "../repositories/kysely-feedback-repository";
import * as service from "../services/feedback";
import { feedbackLimiter } from "../services/feedback-limiter";

export { FEEDBACK_BULK_MAX } from "../services/feedback";

/** Feedback (feature 127). Thin: the service checks everything. */
const context = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  return {
    actor: { user, ip: clientIp(headers, app.trustProxy) },
    deps: {
      feedback: kyselyFeedbackRepository(app.db, app.dialect),
      limiter: feedbackLimiter(),
      version,
    } satisfies service.FeedbackDeps,
  };
};

export const sendFeedback = async (
  headers: Headers,
  input: { kind: unknown; message: unknown; page?: unknown },
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.sendFeedback(deps, actor, input);
};

export const pageFeedback = async (
  headers: Headers,
  query: Parameters<typeof service.listFeedback>[2],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.listFeedback(deps, actor, query);
};

export const countFeedback = async (
  headers: Headers,
  filters: Parameters<typeof service.countFeedback>[2],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.countFeedback(deps, actor, filters);
};

export const findFeedback = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.findFeedback(deps, actor, id);
};

export const countNewFeedback = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.countNewFeedback(deps, actor);
};

export const markFeedbackHandled = async (
  headers: Headers,
  ids: readonly string[],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.markFeedbackHandled(deps, actor, ids);
};

export const deleteFeedback = async (
  headers: Headers,
  ids: readonly string[],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.deleteFeedback(deps, actor, ids);
};
