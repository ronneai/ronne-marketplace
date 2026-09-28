import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
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
