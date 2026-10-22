import type { AppAuth } from "@/server/domains/identity/repositories/auth-instance";
import { entriesOf } from "@/server/domains/items/actions/catalogue";
import { favoritedAmong, listFavorites } from "@/server/domains/shelves/actions/favorites";
import { listPins } from "@/server/domains/shelves/actions/pins";
import type { Shelf } from "@/server/domains/shelves/models/shelf";

/** How many favorites Home shows before See all. */
export const HOME_FAVORITES = 6;

/** The cards for these items, in order, and which of them are favorites. */
const cardsOf = async (headers: Headers, ids: string[], app?: AppAuth) => {
  const entries = await entriesOf(headers, ids, app);
  const starred = [
    ...(await favoritedAmong(
      headers,
      entries.map((entry) => entry.id),
      app,
    )),
  ];
  return { entries, starred };
};

/** The person's latest favorites for Home (feature 125), the ones they see and can install. */
export const loadFavoritesShelf = async (headers: Headers, app?: AppAuth) =>
  // `listFavorites` already leaves out what the reader can't see or install, so the six are the
  // latest six that show.
  cardsOf(headers, (await listFavorites(headers, app)).slice(0, HOME_FAVORITES), app);

/** A pin shelf's cards in order (125): what the reader sees and can install. */
export const loadPinnedShelf = async (headers: Headers, shelf: Shelf, app?: AppAuth) =>
  cardsOf(
    headers,
    (await listPins(headers, shelf, "available", app)).map((pin) => pin.itemId),
    app,
  );
