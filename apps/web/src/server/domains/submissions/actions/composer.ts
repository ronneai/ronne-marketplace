import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
import { kyselyRegistryLookup } from "../repositories/kysely-registry-lookup";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/composer";
import * as search from "../services/dependency-search";

export type { DependencyOption } from "../services/dependency-search";

/** Entry points for the visual composer (feature 031). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth, viewer: Viewer): service.ComposerDeps => ({
  registry: kyselyRegistryLookup(db, dialect, viewer),
  catalogue: kyselyCatalogueRepository(db, dialect, viewer),
  repo: kyselySubmissionRepository(db, dialect, viewer),
});

/** The actor, and what they see (093), built once for the request. */
const context = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  const actor: service.ComposerActor = { user, ip: clientIp(headers, app.trustProxy) };
  return { actor, viewer: await viewerOf(user, app) };
};

export const dependencyReports = async (
  headers: Headers,
  input: Parameters<typeof service.dependencyReports>[2],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await context(headers, app);
  return service.dependencyReports(deps(app, viewer), actor, input);
};

export const searchDependencies = async (
  headers: Headers,
  input: Parameters<typeof service.searchDependencies>[2],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await context(headers, app);
  return service.searchDependencies(deps(app, viewer), actor, input);
};

/** What to offer when picking a dependency (056): the form's Item field and `@` in markdown. */
export const findDependencies = async (
  headers: Headers,
  input: Parameters<typeof search.findDependencies>[2],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await context(headers, app);
  return search.findDependencies(
    {
      repo: kyselySubmissionRepository(app.db, app.dialect, viewer),
      registry: kyselyRegistryLookup(app.db, app.dialect, viewer),
      catalogue: kyselyCatalogueRepository(app.db, app.dialect, viewer),
    },
    actor,
    input,
  );
};
