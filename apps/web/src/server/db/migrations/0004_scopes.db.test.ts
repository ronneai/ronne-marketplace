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

const insertUser = async (email: string) => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: "Root",
      email,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  return id;
};

const insertScope = (name: string, createdBy: string | null) =>
  t.db
    .insertInto("scopes")
    .values({
      id: newId(),
      name,
      description: "A scope.",
      created_by: createdBy,
      created_at: now(),
    })
    .execute();

describe("0004_scopes", () => {
  it("creates a real foreign key to user that sets null on delete, on every database", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["scopes"])).toEqual([
      { table: "scopes", references: "user", onDelete: "SET NULL" },
    ]);
  });

  it("keeps the scope, without its creator, when the user row is deleted", async () => {
    const userId = await insertUser("gone@example.com");
    await insertScope("kept", userId);
    await t.db.deleteFrom("user").where("id", "=", userId).execute();
    const row = await t.db
      .selectFrom("scopes")
      .select("created_by")
      .where("name", "=", "kept")
      .executeTakeFirstOrThrow();
    expect(row.created_by).toBeNull();
  });

  it("refuses a second scope with the same name", async () => {
    await insertScope("platform", null);
    await expect(insertScope("platform", null)).rejects.toThrow();
  });
});
