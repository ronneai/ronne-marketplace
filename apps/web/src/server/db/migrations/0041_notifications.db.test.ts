import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../domains/shelves/repositories/test-seed";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { notifications } from "./0041_notifications";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const row = (user: string, extra: { actor_id?: string } = {}) =>
  t.db
    .insertInto("notifications")
    .values({
      id: newId(),
      user_id: user,
      kind: "submission.approved",
      subject_type: "submission",
      subject_id: newId(),
      params: "{}",
      created_at: toDbDate(new Date(), t.dialect),
      ...extra,
    })
    .execute();

describe("0041_notifications", () => {
  it("has two keys to the user: the person's cascades, the actor's is forgotten", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["notifications"])).toEqual(
      expect.arrayContaining([
        { table: "notifications", references: "user", onDelete: "CASCADE" },
        { table: "notifications", references: "user", onDelete: "SET NULL" },
      ]),
    );
  });

  it("starts unread, needs a person, and goes with the person", async () => {
    const [u, actor] = [await seedUser(t), await seedUser(t, "Actor")];
    await expect(row("1".repeat(26))).rejects.toThrow();
    await row(u, { actor_id: actor });
    const rows = await t.db.selectFrom("notifications").selectAll().execute();
    expect(rows[0]).toMatchObject({ read_at: null, actor_id: actor });
    // The actor can go; the row stays. The person can go; their rows go.
    await t.db.deleteFrom("user").where("id", "=", actor).execute();
    expect(
      (await t.db.selectFrom("notifications").select("actor_id").execute()).map((r) => r.actor_id),
    ).toEqual([null]);
    await t.db.deleteFrom("user").where("id", "=", u).execute();
    expect(await t.db.selectFrom("notifications").selectAll().execute()).toEqual([]);
  });

  it("is safe to run again", async () => {
    await row(await seedUser(t));
    await notifications(t.dialect).up(t.db as never);
    expect(await t.db.selectFrom("notifications").selectAll().execute()).toHaveLength(1);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
