import { instanceStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as bulk from "../services/bulk-approve";
import * as queue from "../services/queue";
import * as page from "../services/review-page";
import * as service from "../services/reviews";
import type { SubmissionActor, SubmissionDeps } from "../services/submissions";

export type { ApprovedSubmission } from "../services/bulk-approve";
export type { QueuePage, QueueRow, QueueTab } from "../services/queue";
export type { ProposalView, ReviewView } from "../services/review-page";
export type { Dependent, ReviewDecision, SentBack } from "../services/reviews";

/** Entry points for review decisions and comments (feature 014). Thin: the services check. */
const deps = ({ db, dialect }: AppAuth): SubmissionDeps => ({
  repo: kyselySubmissionRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<SubmissionActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const decide = async (
  headers: Headers,
  id: string,
  input: { decision: service.ReviewDecision; message?: string },
  app: AppAuth = getAppAuth(),
) => service.decide(deps(app), await actor(headers, app), id, input);

/** Approves several at once (054), with one optional message for all. */
export const approveMany = async (
  headers: Headers,
  input: { ids: readonly string[]; message?: string },
  app: AppAuth = getAppAuth(),
) => bulk.approveMany(deps(app), await actor(headers, app), input);

/** The open submissions that depend on this one, not yet released (056). */
export const listDependents = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.dependentsOf(deps(app), await actor(headers, app), id);

/** Rejects, and (056) sends back the submissions that depend on it when asked. */
export const rejectWithDependents = async (
  headers: Headers,
  id: string,
  input: { message?: string; dependents?: { message?: string } },
  app: AppAuth = getAppAuth(),
) => service.rejectWithDependents(deps(app), await actor(headers, app), id, input);

export const comment = async (
  headers: Headers,
  id: string,
  input: { body: string },
  app: AppAuth = getAppAuth(),
) => service.comment(deps(app), await actor(headers, app), id, input);

export const listQueue = async (
  headers: Headers,
  query: { tab: queue.QueueTab; cursor?: string },
  app: AppAuth = getAppAuth(),
) => queue.listQueue(deps(app), await actor(headers, app), query);

export const countNeedsReview = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  queue.countNeedsReview(deps(app), await actor(headers, app));

/** `storage` holds a change proposal's base version (017); the instance's by default. */
export const getReview = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) => page.getReview({ ...deps(app), storage }, await actor(headers, app), id);
