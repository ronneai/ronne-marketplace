import { instanceStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as bulk from "../services/bulk-approve";
import * as queue from "../services/queue";
import * as page from "../services/review-page";
import * as service from "../services/reviews";
import type { SubmissionActor, SubmissionDeps } from "../services/submissions";

export type { ApprovedSubmission } from "../services/bulk-approve";
export type { QueuePage, QueueQuery, QueueRow, QueueTab } from "../services/queue";
export type { ProposalView, ReviewView } from "../services/review-page";
export type { Dependent, ReviewDecision, SentBack } from "../services/reviews";

/** Entry points for review decisions and comments (feature 014). Thin: the services check. */
const deps = ({ db, dialect }: AppAuth, viewer: Viewer): SubmissionDeps => ({
  repo: kyselySubmissionRepository(db, dialect, viewer),
});

/** The dependencies, bound to what the person sees (093), and the actor: one lookup each. */
const boundWith = async (headers: Headers, app: AppAuth, storage: StorageAdapter) => {
  const [repo, actor] = await bound(headers, app);
  return [{ ...repo, storage }, actor] as const;
};

const bound = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  const actor: SubmissionActor = { user, ip: clientIp(headers, app.trustProxy) };
  return [deps(app, await viewerOf(user, app)), actor] as const;
};

export const decide = async (
  headers: Headers,
  id: string,
  input: {
    decision: service.ReviewDecision;
    message?: string;
    via?: "queue";
    /** The revision the reviewer read (AUTHZ-2). */
    revision?: number | null;
  },
  app: AppAuth = getAppAuth(),
) => service.decide(...(await bound(headers, app)), id, input);

/** Approves several at once (054), with one optional message for all. */
export const approveMany = async (
  headers: Headers,
  input: { items: readonly { id: string; revision: number | null }[]; message?: string },
  app: AppAuth = getAppAuth(),
) => bulk.approveMany(...(await bound(headers, app)), input);

/** The open submissions that depend on this one, not yet released (056). */
export const listDependents = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.dependentsOf(...(await bound(headers, app)), id);

/**
 * How many open submissions depend on it, among those the person may read (093): the withdraw
 * warning (056, 091).
 */
export const countDependents = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.countDependents(...(await bound(headers, app)), id);

/** Rejects, and (056) sends back the submissions that depend on it when asked. */
export const rejectWithDependents = async (
  headers: Headers,
  id: string,
  input: { message?: string; dependents?: { message?: string }; via?: "queue" },
  app: AppAuth = getAppAuth(),
) => service.rejectWithDependents(...(await bound(headers, app)), id, input);

export const comment = async (
  headers: Headers,
  id: string,
  input: { body: string },
  app: AppAuth = getAppAuth(),
) => service.comment(...(await bound(headers, app)), id, input);

export const listQueue = async (
  headers: Headers,
  query: queue.QueueQuery,
  app: AppAuth = getAppAuth(),
) => queue.listQueue(...(await bound(headers, app)), query);

export const countNeedsReview = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  queue.countNeedsReview(...(await bound(headers, app)));

/** `storage` holds a change proposal's base version (017); the instance's by default. */
export const getReview = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) => page.getReview(...(await boundWith(headers, app, storage)), id);
