import { instanceStorage, type StorageAdapter } from "../../../storage";
import type { Authenticated } from "../../identity/actions/access-tokens";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
import type { Submission } from "../models/submission";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as bulk from "../services/bulk-submit";
import * as marks from "../services/dependency-marks";
import * as service from "../services/submissions";

/**
 * Entry points for submitting, withdrawing and viewing submissions (feature 013). Thin: they find
 * who's asking and wire the dependencies; the services check permissions and ownership.
 */
const deps = (
  { db, dialect }: AppAuth,
  viewer: Viewer,
  storage: StorageAdapter = instanceStorage,
): service.SubmissionDeps => ({
  repo: kyselySubmissionRepository(db, dialect, viewer),
  storage,
});

/** The dependencies, bound to what the person sees (093), and the actor: one lookup each. */
const bound = async (headers: Headers, app: AppAuth, storage?: StorageAdapter) => {
  const user = await getCurrentUser(headers, app);
  const actor: service.SubmissionActor = { user, ip: clientIp(headers, app.trustProxy) };
  return [deps(app, await viewerOf(user, app), storage), actor] as const;
};

export type { DependencyMark } from "../services/dependency-marks";

/** What each submission waits on (056), by id, for the ones the person may see. */
export const dependencyMarks = async (
  headers: Headers,
  submissions: readonly Submission[],
  app: AppAuth = getAppAuth(),
) => marks.dependencyMarks(...(await bound(headers, app)), submissions);

export const viewSubmission = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.viewSubmission(...(await bound(headers, app)), id);

/** `storage` holds a change proposal's base version (017); the instance's by default. */
export const checkSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => service.checkSubmission(...(await bound(headers, app, storage)), id);

/** What submitting would send (112): the item and the person's own drafts it needs, checked. */
export const checkSubmitGroup = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => service.checkSubmitGroup(...(await bound(headers, app, storage)), id);

export const submitDraft = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => service.submitDraft(...(await bound(headers, app, storage)), id);

/** Archives it (the default) or deletes it for good (057). */
export const withdrawSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  mode: "archive" | "delete" = "archive",
) => service.withdrawSubmission(...(await bound(headers, app)), id, mode);

export type { RowFeedback } from "../services/submissions";

/** The latest reviewer message on each of the person's own sent back or rejected ones (058). */
export const latestFeedback = async (
  headers: Headers,
  submissions: readonly Submission[],
  app: AppAuth = getAppAuth(),
) => service.latestFeedbackFor(...(await bound(headers, app)), submissions);

/** Whether the person's own submission can be deleted for good now (057). */
export const canDeleteSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
) => service.canDeleteSubmission(...(await bound(headers, app)), id);

/** Deletes an archived submission, or a draft, for good (057). */
export const deleteSubmission = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.deleteSubmission(...(await bound(headers, app)), id);

/** Brings an archived submission back as a draft (057). */
export const restoreSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
) => service.restoreSubmission(...(await bound(headers, app)), id);

export type { BulkSelection, CheckedDraft, SubmittedDraft } from "../services/bulk-submit";

/** For My submissions (052): which of the selection Submit would take, without submitting. */
export const checkManyDrafts = async (
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => bulk.checkMany(...(await bound(headers, app, storage)), selection);

/** For My submissions (052): submits each draft of the selection that's ready. */
export const submitManyDrafts = async (
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => bulk.submitMany(...(await bound(headers, app, storage)), selection);

/** The token's user and address, for 052's API; the audit names the token. */
const tokenActor = (
  auth: Authenticated,
  headers: Headers,
  app: AppAuth,
): service.SubmissionActor => ({
  user: auth.user,
  ip: clientIp(headers, app.trustProxy),
  token: { id: auth.token.id, name: auth.token.name },
});

/** For `POST /api/v1/drafts/check` (052), as the token's user. */
export const checkManyDraftsAs = async (
  auth: Authenticated,
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) =>
  bulk.checkMany(
    deps(app, await viewerOf(auth.user, app), storage),
    tokenActor(auth, headers, app),
    selection,
  );

/** For `POST /api/v1/drafts/submit` (052), as the token's user. */
export const submitManyDraftsAs = async (
  auth: Authenticated,
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) =>
  bulk.submitMany(
    deps(app, await viewerOf(auth.user, app), storage),
    tokenActor(auth, headers, app),
    selection,
  );
