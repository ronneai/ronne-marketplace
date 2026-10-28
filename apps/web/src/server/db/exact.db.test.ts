import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "./dates";
import { exactEquals } from "./exact";
import { createTestDb, type TestDb } from "./testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
  await t.db
    .insertInto("instance_settings")
    .values({
      key: "k_enc",
      value: "v1.AAAA.bbbb",
      updated_by: null,
      updated_at: toDbDate(new Date(), t.dialect),
    })
    .execute();
});
afterEach(() => t.cleanup());

const matches = async (value: string) =>
  (
    await t.db
      .selectFrom("instance_settings")
      .select("key")
      .where("key", "=", "k_enc")
      .where(exactEquals(t.dialect, "value", value))
      .execute()
  ).length;

describe("exactEquals (136)", () => {
  it("matches the same value only, byte for byte: never another case, accents or spaces", async () => {
    expect(await matches("v1.AAAA.bbbb")).toBe(1);
    for (const other of ["v1.AAAA.BBBB", "v1.aaaa.bbbb", "v1.AAAA.bbbb ", "v1.AAAA.bbbḃ"])
      expect(await matches(other), other).toBe(0);
  });
});
