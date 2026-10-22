import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../domains/shelves/repositories/test-seed";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { feedback } from "./0035_feedback";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const row = (user: string, extra: { handled_by?: string } = {}) =>
  t.db
    .insertInto("feedback")
    .values({
      id: newId(),
      user_id: user,
      kind: "idea",
      message: "Hello",
      version: "1.0.0",
      created_at: toDbDate(new Date(), t.dialect),
      ...extra,
    })
    .execute();

describe("0035_feedback", () => {
  it("has two keys to the user: the sender's cascades, the handler's is forgotten", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["feedback"])).toEqual(
      expect.arrayContaining([
        { table: "feedback", references: "user", onDelete: "CASCADE" },
        { table: "feedback", references: "user", onDelete: "SET NULL" },
      ]),
    );
  });

  it("defaults to new, needs a sender, and goes with the sender", async () => {
    const [u, root] = [await seedUser(t), await seedUser(t, "Root")];
    await expect(row("1".repeat(26))).rejects.toThrow();
    await row(u);
    await row(u, { handled_by: root });
    const rows = await t.db.selectFrom("feedback").selectAll().execute();
    expect(rows.map((r) => r.status)).toEqual(["new", "new"]);
    expect(rows[0]).toMatchObject({ page: null, handled_at: null });
    // The one who handled a row can go; the row stays. The sender can go; their rows go.
    await t.db.deleteFrom("user").where("id", "=", root).execute();
    expect(
      (await t.db.selectFrom("feedback").select("handled_by").execute()).map((r) => r.handled_by),
    ).toEqual([null, null]);
    await t.db.deleteFrom("user").where("id", "=", u).execute();
    expect(await t.db.selectFrom("feedback").selectAll().execute()).toEqual([]);
  });

  it("is safe to run again", async () => {
    await row(await seedUser(t));
    await feedback(t.dialect).up(t.db as never);
    expect(await t.db.selectFrom("feedback").selectAll().execute()).toHaveLength(1);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
