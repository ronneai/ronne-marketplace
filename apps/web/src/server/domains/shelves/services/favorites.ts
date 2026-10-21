import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { FavoriteLimitError, ShelfItemNotAvailableError } from "../exceptions/errors";
import { canonicalId, MAX_FAVORITES } from "../models/shelf";
import type { FavoriteRepository } from "../repositories/favorite-repository";
import type { ShelfItemsRepository } from "../repositories/shelf-items-repository";

/**
 * A person's favorites (feature 125): theirs alone, so every call is about the signed-in user and
 * nobody else's list is ever asked for. An item is favorited only while the person sees it and it
 * is released; once it isn't, it drops out of the list but stays, so it comes back with it.
 */
export type FavoriteDeps = {
  favorites: FavoriteRepository;
  /** Built for the viewer (093). */
  items: ShelfItemsRepository;
  now?: () => Date;
};

export type FavoriteActor = { user: CurrentUser | null; ip: string | null };

const signedIn = (actor: FavoriteActor): CurrentUser => {
  // Signed out has no list; the role check is the same one every signed-in feature uses.
  if (!actor.user) throw new ForbiddenError("account.manage_own");
  return actor.user;
};

/** Adds a favorite: "exists" when it already is. Refused for an item they can't see or isn't released. */
export const addFavorite = async (
  deps: FavoriteDeps,
  actor: FavoriteActor,
  itemId: string,
): Promise<"added" | "exists"> => {
  const user = signedIn(actor);
  const id = canonicalId(itemId);
  if ((await deps.items.availability([id])).get(id) !== "available")
    throw new ShelfItemNotAvailableError();
  const outcome = await deps.favorites.add(
    user.id,
    id,
    (deps.now ?? (() => new Date()))(),
    MAX_FAVORITES,
  );
  if (outcome === "full") throw new FavoriteLimitError(MAX_FAVORITES);
  return outcome;
};

/** Removes a favorite, whatever became of the item; false when it wasn't one. */
export const removeFavorite = async (
  deps: FavoriteDeps,
  actor: FavoriteActor,
  itemId: string,
): Promise<boolean> => deps.favorites.remove(signedIn(actor).id, itemId);

/** The person's favorites that they see now and are released, newest first (item ids). */
export const listFavorites = async (
  deps: FavoriteDeps,
  actor: FavoriteActor,
): Promise<string[]> => {
  const user = signedIn(actor);
  const all = await deps.favorites.list(user.id);
  const seen = await deps.items.availability(all.map((f) => f.itemId));
  return all.map((f) => f.itemId).filter((id) => seen.get(id) === "available");
};

/** Which of these items the person has favorited, for the stars on a page of cards. */
export const favoritedAmong = async (
  deps: FavoriteDeps,
  actor: FavoriteActor,
  itemIds: readonly string[],
): Promise<Set<string>> => {
  if (!actor.user) return new Set();
  return new Set(await deps.favorites.among(actor.user.id, [...itemIds]));
};
