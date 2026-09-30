import { ITEM_TYPES, type ItemType, isItemType } from "@ronneai/core";
import { rendererById } from "@ronneai/core/render";
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
/** The most items one API page returns (019, MVP §11). */
export const API_PAGE_MAX = 100;

export type CatalogueQuery = {
  q?: string;
  type?: string;
  scope?: string;
  /** A renderer id (026). */
  tool?: string;
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
  query: {
    q: string;
    type: ItemType | null;
    scope: string | null;
    tool: string | null;
    sort: CatalogueSort;
  };
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

/** A page of published items, without the catalogue page's type counts and scopes: 019's API. */
export type CatalogueSearch = { entries: CatalogueEntry[]; nextCursor: string | null };

export const searchCatalogue = async (
  deps: CatalogueDeps,
  actor: ScopeActor,
  query: {
    q?: string;
    type?: ItemType | null;
    /** Any of these types, and only installable items: 031's picker. */
    types?: readonly ItemType[];
    installable?: boolean;
    scope?: string | null;
    tool?: string | null;
    sort?: CatalogueSort;
    cursor?: string;
    limit?: number;
  },
): Promise<CatalogueSearch> => {
  requirePermission(actor.user, "account.manage_own");
  const sort = query.sort ?? "recent";
  const limit = Math.min(Math.max(query.limit ?? CATALOGUE_PAGE_SIZE, 1), API_PAGE_MAX);
  const rows = await deps.catalogue.list({
    search: query.q || undefined,
    type: query.type ?? undefined,
    types: query.types,
    installable: query.installable,
    scope: query.scope ?? undefined,
    tool: query.tool ?? undefined,
    sort,
    after: decodeCursor(query.cursor, sort),
    limit: limit + 1,
  });
  const entries = rows.slice(0, limit);
  const last = entries.at(-1);
  return {
    entries,
    nextCursor: rows.length > limit && last ? encodeCursor(cursorOf(last, sort)) : null,
  };
};

export const browseCatalogue = async (
  deps: CatalogueDeps,
  actor: ScopeActor,
  query: CatalogueQuery,
): Promise<CataloguePage> => {
  const q = (query.q ?? "").trim().slice(0, CATALOGUE_SEARCH_MAX_LENGTH);
  const type = query.type && isItemType(query.type) ? query.type : null;
  const scope = query.scope?.trim() || null;
  const tool = query.tool && rendererById(query.tool) ? query.tool : null;
  const sort: CatalogueSort = query.sort === "name" ? "name" : "recent";
  const { entries, nextCursor } = await searchCatalogue(deps, actor, {
    q,
    type,
    scope,
    tool,
    sort,
    cursor: query.cursor,
  });
  const counts = new Map(
    (
      await deps.catalogue.typeCounts({
        search: q || undefined,
        scope: scope ?? undefined,
        tool: tool ?? undefined,
      })
    ).map((row) => [row.type, row.count]),
  );
  return {
    entries,
    nextCursor,
    typeCounts: ITEM_TYPES.map((t) => ({ type: t, count: counts.get(t) ?? 0 })),
    scopes: await deps.catalogue.scopes(),
    query: { q, type, scope, tool, sort },
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
