import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedItem, seedUser, seedWorkspace } from "../../domains/shelves/repositories/test-seed";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { pinsAndFavorites } from "./0033_pins_and_favorites";

let t: TestDb;
const now = () => toDbDate(new Date(), t.dialect);

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const favorite = (user: string, item: string) =>
  t.db
    .insertInto("item_favorites")
    .values({ user_id: user, item_id: item, created_at: now() })
    .execute();

const pin = (
  shelf: string,
  workspace: string | null,
  item: string,
  by: string | null,
  position = 1,
) =>
  t.db
    .insertInto("item_pins")
    .values({
      id: newId(),
      workspace_id: workspace,
      shelf,
      item_id: item,
      position,
      created_by: by,
      created_at: now(),
    })
    .execute();

describe("0033_pins_and_favorites", () => {
  it("has the keys", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["item_favorites", "item_pins"]);
    expect(keys).toHaveLength(5);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "item_favorites", references: "user", onDelete: "CASCADE" },
        { table: "item_favorites", references: "items", onDelete: "CASCADE" },
        { table: "item_pins", references: "workspaces", onDelete: "CASCADE" },
        { table: "item_pins", references: "items", onDelete: "CASCADE" },
        { table: "item_pins", references: "user", onDelete: "SET NULL" },
      ]),
    );
  });

  it("a favorite is one per person and item, and goes with either", async () => {
    const [u, item] = [await seedUser(t), await seedItem(t, "a")];
    await expect(favorite(newId(), item)).rejects.toThrow();
    await expect(favorite(u, newId())).rejects.toThrow();
    await favorite(u, item);
    await expect(favorite(u, item)).rejects.toThrow();
    await t.db.deleteFrom("user").where("id", "=", u).execute();
    expect(await t.db.selectFrom("item_favorites").selectAll().execute()).toEqual([]);
  });

  it("a pin is one per shelf and item, including the instance's shelf with no workspace", async () => {
    const [u, item, ws] = [
      await seedUser(t),
      await seedItem(t, "a"),
      await seedWorkspace(t, "acme"),
    ];
    await pin("instance", null, item, u);
    await expect(pin("instance", null, item, u, 2)).rejects.toThrow();
    await pin(ws, ws, item, u);
    await expect(pin(ws, ws, item, u, 2)).rejects.toThrow();
    await expect(pin(ws, newId(), await seedItem(t, "b"), u)).rejects.toThrow();
  });

  it("keeps the pin when its creator's row is deleted, with no creator", async () => {
    const [u, item] = [await seedUser(t), await seedItem(t, "a")];
    await pin("instance", null, item, u);
    await t.db.deleteFrom("user").where("id", "=", u).execute();
    expect(await t.db.selectFrom("item_pins").select("created_by").execute()).toEqual([
      { created_by: null },
    ]);
  });

  it("is safe to run again", async () => {
    const [u, item] = [await seedUser(t), await seedItem(t, "a")];
    await favorite(u, item);
    await pinsAndFavorites(t.dialect).up(t.db as never);
    expect(await t.db.selectFrom("item_favorites").selectAll().execute()).toHaveLength(1);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
