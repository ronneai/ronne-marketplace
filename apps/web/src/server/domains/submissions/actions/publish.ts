import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyReleaseStore } from "../repositories/kysely-release-store";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/publish";

export type { Published, PublishInput } from "../services/publish";

/** Releasing an approved submission (feature 015). Thin: the service checks everything. */
export const publishSubmission = async (
  headers: Headers,
  id: string,
  input: service.PublishInput,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) =>
  service.publishSubmission(
    {
      repo: kyselySubmissionRepository(app.db, app.dialect),
      store: kyselyReleaseStore(app.db, app.dialect),
      storage,
    },
    {
      user: await getCurrentUser(headers, app),
      ip: clientIp(headers, app.trustProxy),
    },
    id,
    input,
  );
