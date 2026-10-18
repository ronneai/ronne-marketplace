import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { isUniqueViolation } from "../locks";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
const now = () => toDbDate(new Date(), t.dialect);

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insertUser = async (email: string) => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: email,
      email,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      role: "user",
      disabled_at: null,
    })
    .execute();
  return id;
};

const insertGrant = (fields: { userCode: string; hash: string; userId?: string | null }) =>
  t.db
    .insertInto("device_grants")
    .values({
      id: newId(),
      device_code_hash: fields.hash,
      user_code: fields.userCode,
      client_id: "rmk",
      name: "rmk on laptop",
      status: "pending",
      user_id: fields.userId ?? null,
      requester_ip: null,
      approver_ip: null,
      interval_seconds: 5,
      last_polled_at: null,
      decided_at: null,
      created_at: now(),
      expires_at: now(),
    })
    .execute();

describe("0027_device_grants", () => {
  it("keeps device codes and user codes unique", async () => {
    await insertGrant({ userCode: "WDJBMJHT", hash: "a".repeat(64) });
    const twice = async (fields: { userCode: string; hash: string }) => {
      try {
        await insertGrant(fields);
        return false;
      } catch (error) {
        return isUniqueViolation(error);
      }
    };
    expect(await twice({ userCode: "WDJBMJHT", hash: "b".repeat(64) })).toBe(true);
    expect(await twice({ userCode: "XXXXXXXX", hash: "a".repeat(64) })).toBe(true);
  });

  it("deletes a user's grants with the user", async () => {
    const userId = await insertUser("ana@example.com");
    await insertGrant({ userCode: "WDJBMJHT", hash: "a".repeat(64), userId });
    expect(await foreignKeys(t.db, t.dialect, ["device_grants"])).toEqual([
      { table: "device_grants", references: "user", onDelete: "CASCADE" },
    ]);
    await t.db.deleteFrom("user").where("id", "=", userId).execute();
    expect(await t.db.selectFrom("device_grants").select("id").execute()).toEqual([]);
  });

  it("adds access_tokens.created_via, null for older tokens", async () => {
    const userId = await insertUser("ben@example.com");
    await t.db
      .insertInto("access_tokens")
      .values({
        id: newId(),
        user_id: userId,
        name: "old",
        token_hash: "c".repeat(64),
        token_prefix: null,
        last_used_at: null,
        expires_at: null,
        revoked_at: null,
        created_at: now(),
      })
      .execute();
    const row = await t.db.selectFrom("access_tokens").selectAll().executeTakeFirstOrThrow();
    expect(row.created_via).toBeNull();
  });
});
