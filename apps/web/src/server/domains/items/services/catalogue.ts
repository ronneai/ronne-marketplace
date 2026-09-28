import { ITEM_TYPES, type ItemType, isItemType } from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import type { CatalogueCursor, CatalogueEntry, CatalogueSort } from "../models/catalogue";
import type { CatalogueRepository } from "../repositories/catalogue-repository";
import type { ScopeActor } from "./scopes";

/**
 * The catalogue and the home page's lists (feature 018). Everyone signed in reads them; 019's API
 * reuses this service. Only items with a published version are listed.
 */
export type CatalogueDeps = { catalogue: CatalogueRepository };

export const CATALOGUE_PAGE_SIZE = 24;
export const HOME_LIST_SIZE = 6;
export const CATALOGUE_SEARCH_MAX_LENGTH = 100;

export type CatalogueQuery = {
  q?: string;
  type?: string;
  scope?: string;
  sort?: string;
  cursor?: string;
};

export type CataloguePage = {
  entries: CatalogueEntry[];
  nextCursor: string | null;
  /** Every type, with how many items match the search and scope. */
  typeCounts: { type: ItemType; count: number }[];
  /** The scopes that hold items, for the scope filter. */
  scopes: string[];
  /** The query as it was understood: unknown types and sorts are dropped. */
  query: { q: string; type: ItemType | null; scope: string | null; sort: CatalogueSort };
};

const encodeCursor = (cursor: CatalogueCursor) =>
  Buffer.from(JSON.stringify(cursor)).toString("base64url");

/** A cursor from the URL, or undefined when it's missing, malformed, or for another sort. */
const decodeCursor = (value: string | undefined, sort: CatalogueSort) => {
  if (!value) return undefined;
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString()) as CatalogueCursor;
    if (cursor.sort !== sort || typeof cursor.installable !== "boolean") return undefined;
    if (
      cursor.sort === "recent" &&
      (typeof cursor.id !== "string" || Number.isNaN(Date.parse(cursor.lastPublishedAt)))
    )
      return undefined;
    if (
      cursor.sort === "name" &&
      (typeof cursor.scope !== "string" || typeof cursor.name !== "string")
    )
      return undefined;
    return cursor;
  } catch {
    return undefined;
  }
};

const cursorOf = (entry: CatalogueEntry, sort: CatalogueSort): CatalogueCursor =>
  sort === "recent"
    ? {
        sort,
        installable: entry.installable,
        lastPublishedAt: entry.lastPublishedAt.toISOString(),
        id: entry.id,
      }
    : { sort, installable: entry.installable, scope: entry.scope, name: entry.name };

export const browseCatalogue = async (
  deps: CatalogueDeps,
  actor: ScopeActor,
  query: CatalogueQuery,
): Promise<CataloguePage> => {
  requirePermission(actor.user, "account.manage_own");
  const q = (query.q ?? "").trim().slice(0, CATALOGUE_SEARCH_MAX_LENGTH);
  const type = query.type && isItemType(query.type) ? query.type : null;
  const scope = query.scope?.trim() || null;
  const sort: CatalogueSort = query.sort === "name" ? "name" : "recent";
  const filter = { search: q || undefined, scope: scope ?? undefined };

  const rows = await deps.catalogue.list({
    ...filter,
    type: type ?? undefined,
    sort,
    after: decodeCursor(query.cursor, sort),
    limit: CATALOGUE_PAGE_SIZE + 1,
  });
  const entries = rows.slice(0, CATALOGUE_PAGE_SIZE);
  const last = entries.at(-1);
  const counts = new Map(
    (await deps.catalogue.typeCounts(filter)).map((row) => [row.type, row.count]),
  );
  return {
    entries,
    nextCursor:
      rows.length > CATALOGUE_PAGE_SIZE && last ? encodeCursor(cursorOf(last, sort)) : null,
    typeCounts: ITEM_TYPES.map((t) => ({ type: t, count: counts.get(t) ?? 0 })),
    scopes: await deps.catalogue.scopes(),
    query: { q, type, scope, sort },
  };
};

export type HomeLists = { recent: CatalogueEntry[]; mostUsed: CatalogueEntry[] };

/** The home page's lists: recently published and most used, installable items only. */
export const homeLists = async (deps: CatalogueDeps, actor: ScopeActor): Promise<HomeLists> => {
  requirePermission(actor.user, "account.manage_own");
  const recent = await deps.catalogue.list({ sort: "recent", limit: HOME_LIST_SIZE });
  return {
    recent: recent.filter((entry) => entry.installable),
    mostUsed: await deps.catalogue.mostUsed(HOME_LIST_SIZE),
  };
};
