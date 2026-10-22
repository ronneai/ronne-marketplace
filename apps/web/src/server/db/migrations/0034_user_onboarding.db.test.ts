import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../domains/shelves/repositories/test-seed";
import { toDbDate } from "../dates";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { userOnboarding } from "./0034_user_onboarding";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const row = (user: string) =>
  t.db
    .insertInto("user_onboarding")
    .values({ user_id: user, updated_at: toDbDate(new Date(), t.dialect) })
    .execute();

describe("0034_user_onboarding", () => {
  it("has one key, to the user, that cascades", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["user_onboarding"])).toEqual([
      { table: "user_onboarding", references: "user", onDelete: "CASCADE" },
    ]);
  });

  it("is one row per person, needs a person, and goes with them", async () => {
    const u = await seedUser(t);
    await expect(row("1".repeat(26))).rejects.toThrow();
    await row(u);
    await expect(row(u)).rejects.toThrow();
    const [saved] = await t.db.selectFrom("user_onboarding").selectAll().execute();
    expect(saved).toMatchObject({
      hidden_at: null,
      install_confirmed_at: null,
      completed_seen_at: null,
    });
    await t.db.deleteFrom("user").where("id", "=", u).execute();
    expect(await t.db.selectFrom("user_onboarding").selectAll().execute()).toEqual([]);
  });

  it("is safe to run again", async () => {
    await row(await seedUser(t));
    await userOnboarding(t.dialect).up(t.db as never);
    expect(await t.db.selectFrom("user_onboarding").selectAll().execute()).toHaveLength(1);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
