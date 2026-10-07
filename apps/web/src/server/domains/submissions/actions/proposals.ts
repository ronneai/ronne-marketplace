import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/proposals";

/** Change proposals (feature 017). Thin: the service checks everything. */
export const proposeChange = async (
  headers: Headers,
  input: { item: string; version: string },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  const user = await getCurrentUser(headers, app);
  return service.proposeChange(
    { repo: kyselySubmissionRepository(app.db, app.dialect, await viewerOf(user, app)), storage },
    { user },
    input,
  );
};

/** The proposal's dependencies, bound to what the person sees (093), and who they are. */
const bound = async (headers: Headers, app: AppAuth, storage: StorageAdapter) => {
  const user = await getCurrentUser(headers, app);
  const repo = kyselySubmissionRepository(app.db, app.dialect, await viewerOf(user, app));
  return { deps: { repo, storage }, user, ip: clientIp(headers, app.trustProxy) };
};

/** Rebases the author's stale proposal onto its item's newest version (017). */
export const rebaseProposal = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  const { deps, user, ip } = await bound(headers, app, storage);
  return service.rebaseProposal(deps, { user, ip }, id);
};

/** Marks one of the last rebase's conflicts resolved. */
export const resolveConflict = async (
  headers: Headers,
  id: string,
  path: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  const { deps, user } = await bound(headers, app, storage);
  return service.resolveConflict(deps, { user }, id, path);
};

/** The author's view of a proposal in the editor: base, stale, and the conflicts with their diffs. */
export const proposalPanel = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  const { deps, user } = await bound(headers, app, storage);
  return service.proposalPanel(deps, { user }, id);
};

export type { ProposalPanel } from "../services/proposals";
