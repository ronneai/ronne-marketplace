import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyReleaseStore } from "../repositories/kysely-release-store";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as bulk from "../services/bulk-release";
import * as service from "../services/publish";

export type { ReleaseSettings } from "../models/release-plan";
export type {
  PreparedRelease,
  ReleaseCandidate,
  ReleasedSubmission,
} from "../services/bulk-release";
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

const publishDeps = (app: AppAuth, storage: StorageAdapter) => ({
  repo: kyselySubmissionRepository(app.db, app.dialect),
  store: kyselyReleaseStore(app.db, app.dialect),
  storage,
});

const sessionActor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** What releasing these would do (055): the order, the dependencies added, what can't go. */
export const prepareRelease = async (
  headers: Headers,
  input: { ids: readonly string[] },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => bulk.prepareRelease(publishDeps(app, storage), await sessionActor(headers, app), input);

/** Releases several approved submissions at once with one set of settings (055). */
export const releaseMany = async (
  headers: Headers,
  input: Parameters<typeof bulk.releaseMany>[2],
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => bulk.releaseMany(publishDeps(app, storage), await sessionActor(headers, app), input);
