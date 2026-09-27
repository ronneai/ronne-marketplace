import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

const now = () => toDbDate(new Date(), t.dialect);

async function insertUser(email: string) {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: "Someone",
      email,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  return id;
}

describe("0002_audit_log", () => {
  it("creates a real foreign key to user that sets null on delete, on every database", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["audit_log"])).toEqual([
      { table: "audit_log", references: "user", onDelete: "SET NULL" },
    ]);
  });

  it("keeps the event, without its actor, when the user row is deleted", async () => {
    const userId = await insertUser("gone@example.com");
    const id = newId();
    await t.db
      .insertInto("audit_log")
      .values({
        id,
        actor_id: userId,
        action: "user.created",
        target_type: "user",
        target_id: userId,
        metadata: "{}",
        ip_address: "2001:0db8:0000:0000:0000:ff00:0042:8329",
        created_at: now(),
      })
      .execute();

    await t.db.deleteFrom("user").where("id", "=", userId).execute();

    const row = await t.db
      .selectFrom("audit_log")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.actor_id).toBeNull();
    expect(row.target_id).toBe(userId);
    // The longest IPv6 form fits.
    expect(row.ip_address).toHaveLength(39);
  });

  it("refuses an actor that isn't a user", async () => {
    await expect(
      t.db
        .insertInto("audit_log")
        .values({
          id: newId(),
          actor_id: newId(),
          action: "user.created",
          target_type: "user",
          target_id: null,
          metadata: "{}",
          ip_address: null,
          created_at: now(),
        })
        .execute(),
    ).rejects.toThrow();
  });
});
