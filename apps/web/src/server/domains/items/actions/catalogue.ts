import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
import { kyselyCatalogueRepository } from "../repositories/kysely-catalogue-repository";
import * as service from "../services/catalogue";

export type { CatalogueEntry, DependencyFacts } from "../models/catalogue";
export type {
  CataloguePage,
  CatalogueQuery,
  CatalogueSearch,
  HomeLists,
} from "../services/catalogue";

/** The catalogue and the home page's lists (feature 018). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth, viewer: Viewer): service.CatalogueDeps => ({
  catalogue: kyselyCatalogueRepository(db, dialect, viewer),
});

/** The actor, and what they see (093), built once for the request. */
const context = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  return {
    actor: { user, ip: clientIp(headers, app.trustProxy) },
    viewer: await viewerOf(user, app),
  };
};

export const browseCatalogue = async (
  headers: Headers,
  query: service.CatalogueQuery,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await context(headers, app);
  return service.browseCatalogue(deps(app, viewer), actor, query);
};

/** The catalogue's facts about an item page's dependencies, for its read-only canvas (044). */
export const dependencyFacts = async (
  headers: Headers,
  names: readonly string[],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await context(headers, app);
  return service.dependencyFacts(deps(app, viewer), actor, names);
};

export const homeLists = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, viewer } = await context(headers, app);
  return service.homeLists(deps(app, viewer), actor);
};

/** For 019's API, where the user comes from a bearer token rather than a session. */
export const searchCatalogueAs = async (
  user: CurrentUser,
  query: Parameters<typeof service.searchCatalogue>[2],
  app: AppAuth = getAppAuth(),
) => service.searchCatalogue(deps(app, await viewerOf(user, app)), { user, ip: null }, query);
