import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyCatalogueRepository } from "../repositories/kysely-catalogue-repository";
import * as service from "../services/catalogue";

export type { CatalogueEntry } from "../models/catalogue";
export type {
  CataloguePage,
  CatalogueQuery,
  CatalogueSearch,
  HomeLists,
} from "../services/catalogue";

/** The catalogue and the home page's lists (feature 018). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth): service.CatalogueDeps => ({
  catalogue: kyselyCatalogueRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const browseCatalogue = async (
  headers: Headers,
  query: service.CatalogueQuery,
  app: AppAuth = getAppAuth(),
) => service.browseCatalogue(deps(app), await actor(headers, app), query);

export const homeLists = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.homeLists(deps(app), await actor(headers, app));

/** For 019's API, where the user comes from a bearer token rather than a session. */
export const searchCatalogueAs = (
  user: CurrentUser,
  query: Parameters<typeof service.searchCatalogue>[2],
  app: AppAuth = getAppAuth(),
) => service.searchCatalogue(deps(app), { user, ip: null }, query);
