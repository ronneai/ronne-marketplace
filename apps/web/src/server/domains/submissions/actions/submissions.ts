import { instanceStorage, type StorageAdapter } from "../../../storage";
import type { Authenticated } from "../../identity/actions/access-tokens";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
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
  storage: StorageAdapter = instanceStorage,
): service.SubmissionDeps => ({
  repo: kyselySubmissionRepository(db, dialect),
  storage,
});

const actor = async (headers: Headers, app: AppAuth): Promise<service.SubmissionActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export type { DependencyMark } from "../services/dependency-marks";

/** What each submission waits on (056), by id, for the ones the person may see. */
export const dependencyMarks = async (
  headers: Headers,
  submissions: readonly Submission[],
  app: AppAuth = getAppAuth(),
) => marks.dependencyMarks(deps(app), await actor(headers, app), submissions);

export const viewSubmission = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.viewSubmission(deps(app), await actor(headers, app), id);

/** `storage` holds a change proposal's base version (017); the instance's by default. */
export const checkSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => service.checkSubmission(deps(app, storage), await actor(headers, app), id);

export const submitDraft = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => service.submitDraft(deps(app, storage), await actor(headers, app), id);

/** Archives it (the default) or deletes it for good (057). */
export const withdrawSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  mode: "archive" | "delete" = "archive",
) => service.withdrawSubmission(deps(app), await actor(headers, app), id, mode);

/** Deletes an archived submission, or a draft, for good (057). */
export const deleteSubmission = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.deleteSubmission(deps(app), await actor(headers, app), id);

/** Brings an archived submission back as a draft (057). */
export const restoreSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
) => service.restoreSubmission(deps(app), await actor(headers, app), id);

export type { BulkSelection, CheckedDraft, SubmittedDraft } from "../services/bulk-submit";

/** For My submissions (052): which of the selection Submit would take, without submitting. */
export const checkManyDrafts = async (
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => bulk.checkMany(deps(app, storage), await actor(headers, app), selection);

/** For My submissions (052): submits each draft of the selection that's ready. */
export const submitManyDrafts = async (
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => bulk.submitMany(deps(app, storage), await actor(headers, app), selection);

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
export const checkManyDraftsAs = (
  auth: Authenticated,
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => bulk.checkMany(deps(app, storage), tokenActor(auth, headers, app), selection);

/** For `POST /api/v1/drafts/submit` (052), as the token's user. */
export const submitManyDraftsAs = (
  auth: Authenticated,
  headers: Headers,
  selection: bulk.BulkSelection,
  app: AppAuth = getAppAuth(),
  storage?: StorageAdapter,
) => bulk.submitMany(deps(app, storage), tokenActor(auth, headers, app), selection);
