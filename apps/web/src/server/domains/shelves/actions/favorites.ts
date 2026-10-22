import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import { kyselyFavoriteRepository } from "../repositories/kysely-favorite-repository";
import { kyselyShelfItemsRepository } from "../repositories/kysely-shelf-items-repository";
import * as service from "../services/favorites";

/** Favorites (feature 125). Thin: the service checks everything. */
const context = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  const viewer = await viewerOf(user, app);
  return {
    actor: { user, ip: clientIp(headers, app.trustProxy) },
    deps: {
      favorites: kyselyFavoriteRepository(app.db, app.dialect),
      items: kyselyShelfItemsRepository(app.db, viewer),
    } satisfies service.FavoriteDeps,
  };
};

export const addFavorite = async (
  headers: Headers,
  itemId: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.addFavorite(deps, actor, itemId);
};

export const removeFavorite = async (
  headers: Headers,
  itemId: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.removeFavorite(deps, actor, itemId);
};

export const listFavorites = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const { actor, deps } = await context(headers, app);
  return service.listFavorites(deps, actor);
};

export const favoritedAmong = async (
  headers: Headers,
  itemIds: readonly string[],
  app: AppAuth = getAppAuth(),
) => {
  const { actor, deps } = await context(headers, app);
  return service.favoritedAmong(deps, actor, itemIds);
};
