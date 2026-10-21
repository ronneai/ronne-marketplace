/** Whether an item can be shelved: it is released and has a version someone can install. */
export type ItemAvailability = "available" | "unavailable";

/**
 * The items a viewer sees, for the shelves (feature 125). Built for one viewer (093): an item they
 * can't see is simply missing from the answer, so a pin or favorite reveals nothing about it.
 * Kysely in kysely-shelf-items-repository.ts.
 */
export interface ShelfItemsRepository {
  /**
   * For each of these item ids the viewer sees: "available" when it has a released, installable
   * version, "unavailable" when it has none (never released, or every version yanked). Ids the
   * viewer can't see, and ids that don't exist, are not in the map.
   */
  availability(itemIds: readonly string[]): Promise<Map<string, ItemAvailability>>;
}
