/** Whether an item can be shelved: it is released and has a version someone can install. */
export type ItemAvailability = "available" | "unavailable";

/** What the shelves need to know about an item the viewer sees. */
export type ShelfItemFacts = {
  availability: ItemAvailability;
  /** Its full name, `@scope/name` in `global` (118). */
  name: string;
  workspaceId: string;
  workspaceVisibility: "public" | "private";
};

/**
 * The items and workspaces a viewer sees, for the shelves (feature 125). Built for one viewer
 * (093): what they can't see is simply missing from the answer, so a pin or favorite reveals
 * nothing about it. Kysely in kysely-shelf-items-repository.ts.
 */
export interface ShelfItemsRepository {
  /**
   * For each of these item ids the viewer sees: "available" when it has a released, installable
   * version, "unavailable" when it has none (never released, or every version yanked). Ids the
   * viewer can't see, and ids that don't exist, are not in the map.
   */
  availability(itemIds: readonly string[]): Promise<Map<string, ItemAvailability>>;
  /** The same ids, with the item's name and workspace. */
  facts(itemIds: readonly string[]): Promise<Map<string, ShelfItemFacts>>;
  /** A workspace the viewer sees, or null (it doesn't exist, or it is private to them). */
  workspace(id: string): Promise<{ id: string; name: string } | null>;
  /**
   * The workspaces the viewer sees among `ids`, or the ones their lists show (`"all"`, at most
   * `limit`: root's, without other people's personal ones), by name.
   */
  workspaces(
    which: readonly string[] | "all",
    limit: number,
  ): Promise<{ id: string; name: string }[]>;
}
