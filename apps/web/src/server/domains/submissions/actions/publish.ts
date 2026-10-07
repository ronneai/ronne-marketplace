import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
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
) => service.publishSubmission(...(await bound(headers, app, storage)), id, input);

/**
 * The dependencies, the submissions read as the person sees them (093), and the actor. The release
 * store reads every workspace: a release is authorised by the release rules (015, 091).
 */
const bound = async (headers: Headers, app: AppAuth, storage: StorageAdapter) => {
  const user = await getCurrentUser(headers, app);
  const deps = {
    repo: kyselySubmissionRepository(app.db, app.dialect, await viewerOf(user, app)),
    store: kyselyReleaseStore(app.db, app.dialect),
    storage,
  };
  return [deps, { user, ip: clientIp(headers, app.trustProxy) }] as const;
};

/** What releasing these would do (055): the order, the dependencies added, what can't go. */
export const prepareRelease = async (
  headers: Headers,
  input: { ids: readonly string[] },
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => bulk.prepareRelease(...(await bound(headers, app, storage)), input);

/** Releases several approved submissions at once with one set of settings (055). */
export const releaseMany = async (
  headers: Headers,
  input: Parameters<typeof bulk.releaseMany>[2],
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => bulk.releaseMany(...(await bound(headers, app, storage)), input);
