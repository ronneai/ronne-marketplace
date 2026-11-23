import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../create-db";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { passwordResetFlows } from "./0048_password_reset_flows";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

/** A table's indexes, by name, as each database lists them. */
const indexes = async (db: Db, table: string): Promise<string[]> => {
  if (t.dialect === "sqlite") {
    const { rows } = await sql<{
      name: string;
    }>`select name from pragma_index_list(${table})`.execute(db);
    return rows.map((r) => r.name);
  }
  if (t.dialect === "postgres") {
    const { rows } = await sql<{
      indexname: string;
    }>`select indexname from pg_indexes where tablename = ${table}`.execute(db);
    return rows.map((r) => r.indexname);
  }
  const { rows } = await sql<{ name: string }>`select distinct index_name as name
    from information_schema.statistics where table_schema = database() and table_name = ${table}`.execute(
    db,
  );
  return rows.map((r) => r.name);
};

const now = () => toDbDate(new Date("2026-11-23T12:00:00.000Z"), t.dialect);

const insertUser = async () => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: "Ana",
      email: `${id.toLowerCase()}@acme.example`,
      email_verified: 1,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  return id;
};

const flow = (userId: string | null, tokenHash = "a".repeat(64)) => ({
  id: newId(),
  token_hash: tokenHash,
  user_id: userId,
  step: "code",
  expires_at: now(),
  created_at: now(),
});

describe("migration 0048_password_reset_flows (194)", () => {
  it("makes the table, which takes a flow for an account and one for no account", async () => {
    const userId = await insertUser();
    await t.db
      .insertInto("password_reset_flows")
      .values(flow(userId, "a".repeat(64)))
      .execute();
    await t.db
      .insertInto("password_reset_flows")
      .values(flow(null, "b".repeat(64)))
      .execute();
    const rows = await t.db
      .selectFrom("password_reset_flows")
      .select(["user_id", "step"])
      .orderBy("token_hash")
      .execute();
    expect(rows).toEqual([
      { user_id: userId, step: "code" },
      { user_id: null, step: "code" },
    ]);
  });

  it("keeps no email address and no IP", async () => {
    await t.db.insertInto("password_reset_flows").values(flow(null)).execute();
    const row = await t.db.selectFrom("password_reset_flows").selectAll().executeTakeFirstOrThrow();
    expect(Object.keys(row).sort()).toEqual(
      ["created_at", "expires_at", "id", "step", "token_hash", "user_id"].sort(),
    );
  });

  it("refuses a second flow with the same token hash", async () => {
    await t.db.insertInto("password_reset_flows").values(flow(null)).execute();
    await expect(
      t.db.insertInto("password_reset_flows").values(flow(null)).execute(),
    ).rejects.toThrow();
  });

  it("has a real foreign key to user that cascades, on every database", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["password_reset_flows"])).toEqual([
      { table: "password_reset_flows", references: "user", onDelete: "CASCADE" },
    ]);
    const userId = await insertUser();
    await t.db.insertInto("password_reset_flows").values(flow(userId)).execute();
    await t.db.deleteFrom("user").where("id", "=", userId).execute();
    expect(await t.db.selectFrom("password_reset_flows").select("id").execute()).toEqual([]);
  });

  it("indexes an account's flows and the purge", async () => {
    expect(await indexes(t.db, "password_reset_flows")).toEqual(
      expect.arrayContaining(["password_reset_flows_user_idx", "password_reset_flows_expires_idx"]),
    );
  });

  it("can run again over itself, as a rerun after a failure on MySQL does", async () => {
    await passwordResetFlows(t.dialect).up(t.db as unknown as Kysely<unknown>);
    expect(await indexes(t.db, "password_reset_flows")).toEqual(
      expect.arrayContaining(["password_reset_flows_user_idx", "password_reset_flows_expires_idx"]),
    );
  });
});
