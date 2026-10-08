import { instanceStorage, type StorageAdapter } from "../../../storage";
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
  UploadedDraft,
  UploadFile,
} from "../services/drafts";

import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";

/**
 * Entry points for /submissions (feature 012). Thin: they find who's asking and wire the
 * dependencies; the services check permissions and ownership.
 */
const deps = (
  { db, dialect }: AppAuth,
  viewer: Viewer,
  storage?: StorageAdapter,
): service.DraftDeps => ({
  repo: kyselySubmissionRepository(db, dialect, viewer),
  ...(storage ? { storage } : {}),
});

/** The dependencies, bound to what the person sees (093), and the actor: one lookup each. */
const bound = async (headers: Headers, app: AppAuth, storage?: StorageAdapter) => {
  const user = await getCurrentUser(headers, app);
  const actor: service.DraftActor = { user, ip: clientIp(headers, app.trustProxy) };
  return [deps(app, await viewerOf(user, app), storage), actor] as const;
};

export const createDraft = async (
  headers: Headers,
  input: { scope: string; name: string; type: string },
  app: AppAuth = getAppAuth(),
) => service.createDraft(...(await bound(headers, app)), input);

/**
 * For 037's API, where the user comes from a bearer token rather than a session: the draft is the
 * token's user's, and the audit event names the token and the request's address.
 */
export const createDraftFromFilesAs = async (
  auth: Authenticated,
  headers: Headers,
  input: {
    scope: string;
    name: string;
    type: string;
    files: readonly service.UploadFile[];
    base?: string;
  },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) =>
  service.createDraftFromFiles(
    deps(app, await viewerOf(auth.user, app), storage),
    {
      user: auth.user,
      ip: clientIp(headers, app.trustProxy),
      token: { id: auth.token.id, name: auth.token.name },
    },
    input,
  );

/** For 051's API: the token's user's open submissions, of one item when `itemName` is given. */
export const listOpenDraftsAs = async (
  auth: Authenticated,
  itemName: string | undefined,
  app: AppAuth = getAppAuth(),
) =>
  service.listOpenDrafts(deps(app, await viewerOf(auth.user, app)), { user: auth.user }, itemName);

/** For 051's API: replaces the token's user's draft's files, auditing the token and address. */
export const replaceDraftFromFilesAs = async (
  auth: Authenticated,
  headers: Headers,
  id: string,
  input: {
    scope: string;
    name: string;
    type: string;
    files: readonly service.UploadFile[];
    base?: string;
  },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) =>
  service.replaceDraftFromFiles(
    deps(app, await viewerOf(auth.user, app), storage),
    {
      user: auth.user,
      ip: clientIp(headers, app.trustProxy),
      token: { id: auth.token.id, name: auth.token.name },
    },
    id,
    input,
  );

export const listMySubmissions = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.listMySubmissions(...(await bound(headers, app)));

/** My submissions' table (063): one page, sorted and filtered, with the total. */
export const pageMySubmissions = async (
  headers: Headers,
  query: service.MySubmissionsQuery,
  app: AppAuth = getAppAuth(),
) => service.pageMySubmissions(...(await bound(headers, app)), query);

export const countMySubmissionsByStatus = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.countMySubmissionsByStatus(...(await bound(headers, app)));

export const getDraft = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.getDraft(...(await bound(headers, app)), id);

/** What Submit would refuse for your own draft as it's saved (#142), for the editor's first load. */
export const draftSubmitIssues = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) => service.draftSubmitIssues(...(await bound(headers, app, storage)), id);

/** With storage, so a change proposal that changes nothing is told so on save (#142). */
export const saveDraftFiles = async (
  headers: Headers,
  id: string,
  changes: service.DraftChanges,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) => service.saveDraftFiles(...(await bound(headers, app, storage)), id, changes);

export const importZip = async (
  headers: Headers,
  id: string,
  input: { archive: Uint8Array; mode: "merge" | "replace" },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = instanceStorage,
) => service.importZip(...(await bound(headers, app, storage)), id, input);

export const renameDraft = async (
  headers: Headers,
  id: string,
  input: { scope: string; name: string },
  app: AppAuth = getAppAuth(),
) => service.renameDraft(...(await bound(headers, app)), id, input);

export const deleteDraft = async (headers: Headers, id: string, app: AppAuth = getAppAuth()) =>
  service.deleteDraft(...(await bound(headers, app)), id);
