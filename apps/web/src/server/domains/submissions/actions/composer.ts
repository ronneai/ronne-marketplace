import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../../items/repositories/kysely-catalogue-repository";
import { kyselyRegistryLookup } from "../repositories/kysely-registry-lookup";
import * as service from "../services/composer";

/** Entry points for the visual composer (feature 031). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth): service.ComposerDeps => ({
  registry: kyselyRegistryLookup(db, dialect),
  catalogue: kyselyCatalogueRepository(db, dialect),
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
