import type { Authenticated } from "../../identity/actions/access-tokens";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/drafts";

export type {
  DraftChanges,
  FileDelete,
  FileWrite,
  SavedDraft,
  UploadFile,
} from "../services/drafts";

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

/**
 * For 037's API, where the user comes from a bearer token rather than a session: the draft is the
 * token's user's, and the audit event names the token and the request's address.
 */
export const createDraftFromFilesAs = (
  auth: Authenticated,
  headers: Headers,
  input: { scope: string; name: string; type: string; files: readonly service.UploadFile[] },
  app: AppAuth = getAppAuth(),
) =>
  service.createDraftFromFiles(
    deps(app),
    {
      user: auth.user,
      ip: clientIp(headers, app.trustProxy),
      token: { id: auth.token.id, name: auth.token.name },
    },
    input,
  );

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
