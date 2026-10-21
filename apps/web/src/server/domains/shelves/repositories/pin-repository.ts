import type { MoveOutcome, Pin, PinOutcome, Shelf } from "../models/shelf";

/**
 * The pin shelves (feature 125). Kysely in kysely-pin-repository.ts. Ids are taken in any case.
 * The item and the workspace must exist: the service checks first, and a missing one is the
 * database's foreign key error, not an outcome.
 */
export interface PinRepository {
  /**
   * Pins an item last on the shelf: "exists" if it's there (nothing changes), "full" at the limit.
   * Two pins at once can't pass the limit: the shelf is locked while one is added.
   */
  add(
    shelf: Shelf,
    itemId: string,
    by: string,
    at: Date,
    limit: number,
    id?: string,
  ): Promise<PinOutcome>;
  /** Unpins an item and closes the gap in the positions; false when it wasn't there. */
  remove(shelf: Shelf, itemId: string): Promise<boolean>;
  /** Swaps an item with its neighbour; "edge" when there is none that way. */
  move(shelf: Shelf, itemId: string, direction: "up" | "down"): Promise<MoveOutcome>;
  /** The shelf in order. */
  list(shelf: Shelf): Promise<Pin[]>;
  count(shelf: Shelf): Promise<number>;
  /** Which shelves hold this item: the instance's, and workspaces' by id. */
  shelvesOf(itemId: string): Promise<{ instance: boolean; workspaceIds: string[] }>;
}
