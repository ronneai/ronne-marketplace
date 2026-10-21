import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { MoveOutcome, Pin, PinOutcome, Shelf } from "../models/shelf";

/**
 * The pin shelves (feature 125). Kysely in kysely-pin-repository.ts. Ids are taken in any case.
 * The item and the workspace must exist: the service checks first, and a missing one is the
 * database's foreign key error, not an outcome.
 */
export interface PinRepository {
  /**
   * Pins an item last on the shelf: "exists" if it's there (nothing changes), "full" at the limit,
   * "private" when `requirePublicWorkspace` is set and the item's workspace isn't public.
   * Two pins at once can't pass the limit: the shelf is locked while one is added. `audit` is
   * recorded in the same transaction, only when the pin was added.
   */
  add(
    shelf: Shelf,
    itemId: string,
    options: {
      by: string;
      at: Date;
      limit: number;
      audit?: NewAuditEvent;
      id?: string;
      /**
       * For Start here, which everyone sees: the item's workspace is locked and read again under
       * the lock, and "private" is answered if it isn't public. Turning a workspace private takes
       * the same lock, so a pin can't land after its workspace's items were taken off the shelf.
       */
      requirePublicWorkspace?: boolean;
    },
  ): Promise<PinOutcome>;
  /**
   * Unpins an item and closes the gap in the positions; false when it wasn't there. `audit` is
   * recorded with it, only when something was removed.
   */
  remove(
    shelf: Shelf,
    itemId: string,
    audit?: { event: NewAuditEvent; at: Date },
  ): Promise<boolean>;
  /**
   * Swaps an item with its neighbour; "edge" when there is none that way. `audit` is recorded with
   * it, only when it moved.
   */
  move(
    shelf: Shelf,
    itemId: string,
    direction: "up" | "down",
    audit?: { event: NewAuditEvent; at: Date },
  ): Promise<MoveOutcome>;
  /** The shelf in order. */
  list(shelf: Shelf): Promise<Pin[]>;
  count(shelf: Shelf): Promise<number>;
  /** Which shelves hold this item: the instance's, and workspaces' by id. */
  shelvesOf(itemId: string): Promise<{ instance: boolean; workspaceIds: string[] }>;
}
