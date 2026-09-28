import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/proposals";

/** Change proposals (feature 017). Thin: the service checks everything. */
export const proposeChange = async (
  headers: Headers,
  input: { item: string; version: string },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) =>
  service.proposeChange(
    { repo: kyselySubmissionRepository(app.db, app.dialect), storage },
    { user: await getCurrentUser(headers, app) },
    input,
  );

const proposalDeps = (app: AppAuth, storage: StorageAdapter) => ({
  repo: kyselySubmissionRepository(app.db, app.dialect),
  storage,
});

/** Rebases the author's stale proposal onto its item's newest version (017). */
export const rebaseProposal = async (
  headers: Headers,
  id: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) =>
  service.rebaseProposal(
    proposalDeps(app, storage),
    { user: await getCurrentUser(headers, app), ip: clientIp(headers, app.trustProxy) },
    id,
  );

/** Marks one of the last rebase's conflicts resolved. */
export const resolveConflict = async (
  headers: Headers,
  id: string,
  path: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) =>
  service.resolveConflict(
    proposalDeps(app, storage),
    { user: await getCurrentUser(headers, app) },
    id,
    path,
  );
