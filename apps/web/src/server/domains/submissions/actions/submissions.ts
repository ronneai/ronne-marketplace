import { instanceStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
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

export const withdrawSubmission = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
) => service.withdrawSubmission(deps(app), await actor(headers, app), id);
