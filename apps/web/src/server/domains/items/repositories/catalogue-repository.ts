import type {
  CatalogueCursor,
  CatalogueEntry,
  CatalogueFilter,
  CatalogueSort,
} from "../models/catalogue";

/** Reading the published items (feature 018). Kysely in kysely-catalogue-repository.ts. */
export interface CatalogueRepository {
  /** Items with a published version, installable ones first, in `sort` order, after `after`. */
  list(
    query: CatalogueFilter & { sort: CatalogueSort; after?: CatalogueCursor; limit: number },
  ): Promise<CatalogueEntry[]>;
  /** The listed items with these names, in no particular order (031's canvas). */
  byNames(names: readonly { scope: string; name: string }[]): Promise<CatalogueEntry[]>;
  /** How many listed items of each type match the search and scope (the type filter is ignored). */
  typeCounts(filter: Omit<CatalogueFilter, "type">): Promise<{ type: string; count: number }[]>;
  /** The scopes that hold listed items, by name. */
  scopes(): Promise<string[]>;
  /**
   * Every workspace (090), `global` first, then by name: all of them can be seen until private
   * workspaces (093).
   */
  workspaces(): Promise<string[]>;
  /** Installable items with downloads, the most downloaded first. */
  mostUsed(limit: number): Promise<CatalogueEntry[]>;
}
