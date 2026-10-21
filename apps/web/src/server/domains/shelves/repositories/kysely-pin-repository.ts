import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate, readCommittedTransaction } from "../../../db/locks";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import { canonicalId, type Pin, type Shelf, shelfKey } from "../models/shelf";
import type { PinRepository } from "./pin-repository";

type Db = Kysely<Database>;

/**
 * Locks the shelf until the transaction ends, so pins added, removed or moved at once are applied
 * one after the other. A workspace's row stands for its shelf; the instance's shelf has none, so
 * the `global` workspace's row stands for it.
 */
const lockShelf = (trx: Db, dialect: DatabaseDialect, shelf: Shelf) =>
  forUpdate(
    trx
      .selectFrom("workspaces")
      .select("id")
      .where(
        "id",
        "=",
        shelf.kind === "instance" ? GLOBAL_WORKSPACE_ID : canonicalId(shelf.workspaceId),
      ),
    dialect,
  ).execute();

const ordered = async (trx: Db, shelf: Shelf): Promise<Pin[]> =>
  (
    await trx
      .selectFrom("item_pins")
      .select(["id", "item_id", "position", "created_by", "created_at"])
      .where("shelf", "=", shelfKey(shelf))
      .orderBy("position", "asc")
      .orderBy("id", "asc")
      .execute()
  ).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    position: row.position,
    createdBy: row.created_by,
    createdAt: fromDbDate(row.created_at),
  }));

/** Writes positions 1, 2, 3… for the pins in this order, touching only the ones that change. */
const renumber = async (trx: Db, pins: Pin[]) => {
  for (const [index, pin] of pins.entries())
    if (pin.position !== index + 1)
      await trx
        .updateTable("item_pins")
        .set({ position: index + 1 })
        .where("id", "=", pin.id)
        .execute();
};

export const kyselyPinRepository = (db: Db, dialect: DatabaseDialect): PinRepository => ({
  add: (shelf, rawItemId, { by, at, limit, audit, id = newId() }) =>
    readCommittedTransaction(db, dialect).execute(async (trx) => {
      const itemId = canonicalId(rawItemId);
      await lockShelf(trx, dialect, shelf);
      const pins = await ordered(trx, shelf);
      if (pins.some((pin) => pin.itemId === itemId)) return "exists" as const;
      if (pins.length >= limit) return "full" as const;
      // Pins that left with their item (a cascade) leave a gap: close it before taking the next place.
      await renumber(trx, pins);
      await trx
        .insertInto("item_pins")
        .values({
          id,
          workspace_id: shelf.kind === "instance" ? null : canonicalId(shelf.workspaceId),
          shelf: shelfKey(shelf),
          item_id: itemId,
          position: pins.length + 1,
          created_by: by,
          created_at: toDbDate(at, dialect),
        })
        .execute();
      if (audit) await recordAudit(trx, dialect, audit, at);
      return "added" as const;
    }),

  remove: (shelf, rawItemId, audit) =>
    readCommittedTransaction(db, dialect).execute(async (trx) => {
      const itemId = canonicalId(rawItemId);
      await lockShelf(trx, dialect, shelf);
      const pins = await ordered(trx, shelf);
      if (!pins.some((pin) => pin.itemId === itemId)) return false;
      await trx
        .deleteFrom("item_pins")
        .where("shelf", "=", shelfKey(shelf))
        .where("item_id", "=", itemId)
        .execute();
      await renumber(
        trx,
        pins.filter((pin) => pin.itemId !== itemId),
      );
      if (audit) await recordAudit(trx, dialect, audit.event, audit.at);
      return true;
    }),

  move: (shelf, rawItemId, direction, audit) =>
    readCommittedTransaction(db, dialect).execute(async (trx) => {
      const itemId = canonicalId(rawItemId);
      await lockShelf(trx, dialect, shelf);
      const pins = await ordered(trx, shelf);
      const index = pins.findIndex((pin) => pin.itemId === itemId);
      if (index < 0) return "missing" as const;
      const other = direction === "up" ? index - 1 : index + 1;
      if (other < 0 || other >= pins.length) return "edge" as const;
      const swapped = [...pins];
      [swapped[index], swapped[other]] = [swapped[other] as Pin, swapped[index] as Pin];
      await renumber(trx, swapped);
      if (audit) await recordAudit(trx, dialect, audit.event, audit.at);
      return "moved" as const;
    }),

  list: (shelf) => ordered(db, shelf),

  count: async (shelf) =>
    Number(
      (
        await db
          .selectFrom("item_pins")
          .select((eb) => eb.fn.countAll().as("count"))
          .where("shelf", "=", shelfKey(shelf))
          .executeTakeFirstOrThrow()
      ).count,
    ),

  shelvesOf: async (rawItemId) => {
    const itemId = canonicalId(rawItemId);
    const rows = await db
      .selectFrom("item_pins")
      .select("workspace_id")
      .where("item_id", "=", itemId)
      .execute();
    return {
      instance: rows.some((row) => row.workspace_id === null),
      workspaceIds: rows.flatMap((row) => (row.workspace_id ? [row.workspace_id] : [])),
    };
  },
});
