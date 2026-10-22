import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../domains/shelves/repositories/test-seed";
import { toDbDate } from "../dates";
import { migrateToLatest } from "../migrate";
import { createTestDb, type TestDb } from "../testing/test-db";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

describe("0036_password_change_required", () => {
  it("leaves every account asking nothing, and stores the time when it is set", async () => {
    const u = await seedUser(t);
    const read = async () =>
      (
        await t.db
          .selectFrom("user")
          .select("password_change_required_at")
          .where("id", "=", u)
          .executeTakeFirstOrThrow()
      ).password_change_required_at;
    expect(await read()).toBeNull();
    await t.db
      .updateTable("user")
      .set({ password_change_required_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", u)
      .execute();
    expect(await read()).not.toBeNull();
  });

  it("has nothing left to apply", async () => {
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
