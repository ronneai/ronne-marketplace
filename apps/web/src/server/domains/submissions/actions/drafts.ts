import { getCurrentUser } from "../../identity/actions/session";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/drafts";

export type { DraftChanges, FileDelete, FileWrite, SavedDraft } from "../services/drafts";

/**
 * Entry points for /submissions (feature 012). Thin: they find who's asking and wire the
 * dependencies; the services check permissions and ownership.
 */
const deps = ({ db, dialect }: AppAuth): service.DraftDeps => ({
  repo: kyselySubmissionRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<service.DraftActor> => ({
  user: await getCurrentUser(headers, app),
});

export const createDraft = async (
  headers: Headers,
  input: { scope: string; name: string; type: string },
  app: AppAuth = getAppAuth(),
) => service.createDraft(deps(app), await actor(headers, app), input);

export const listMySubmissions = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.listMySubmissions(deps(app), await actor(headers, app));

export const getDraft = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.getDraft(deps(app), await actor(headers, app), id);

export const saveDraftFiles = async (
  headers: Headers,
  id: string,
  changes: service.DraftChanges,
  app: AppAuth = getAppAuth(),
) => service.saveDraftFiles(deps(app), await actor(headers, app), id, changes);

export const importZip = async (
  headers: Headers,
  id: string,
  input: { archive: Uint8Array; mode: "merge" | "replace" },
  app: AppAuth = getAppAuth(),
) => service.importZip(deps(app), await actor(headers, app), id, input);

export const renameDraft = async (
  headers: Headers,
  id: string,
  input: { scope: string; name: string },
  app: AppAuth = getAppAuth(),
) => service.renameDraft(deps(app), await actor(headers, app), id, input);

export const deleteDraft = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.deleteDraft(deps(app), await actor(headers, app), id);
