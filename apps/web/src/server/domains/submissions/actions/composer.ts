import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { kyselyRegistryLookup } from "../repositories/kysely-registry-lookup";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/composer";
import * as search from "../services/dependency-search";

export type { DependencyOption } from "../services/dependency-search";

/** Entry points for the visual composer (feature 031). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth): service.ComposerDeps => ({
  registry: kyselyRegistryLookup(db, dialect),
  catalogue: kyselyCatalogueRepository(db, dialect),
  repo: kyselySubmissionRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<service.ComposerActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const dependencyReports = async (
  headers: Headers,
  input: Parameters<typeof service.dependencyReports>[2],
  app: AppAuth = getAppAuth(),
) => service.dependencyReports(deps(app), await actor(headers, app), input);

export const searchDependencies = async (
  headers: Headers,
  input: Parameters<typeof service.searchDependencies>[2],
  app: AppAuth = getAppAuth(),
) => service.searchDependencies(deps(app), await actor(headers, app), input);

/** What to offer when picking a dependency (056): the form's Item field and `@` in markdown. */
export const findDependencies = async (
  headers: Headers,
  input: Parameters<typeof search.findDependencies>[2],
  app: AppAuth = getAppAuth(),
) =>
  search.findDependencies(
    {
      repo: kyselySubmissionRepository(app.db, app.dialect),
      registry: kyselyRegistryLookup(app.db, app.dialect),
      catalogue: kyselyCatalogueRepository(app.db, app.dialect),
    },
    await actor(headers, app),
    input,
  );
