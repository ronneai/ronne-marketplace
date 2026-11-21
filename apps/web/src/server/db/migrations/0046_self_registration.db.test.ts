import { type Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot } from "../../domains/identity/actions/root-account";
import type { Db } from "../create-db";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { createTestDb, type TestDb } from "../testing/test-db";
import { selfRegistration } from "./0046_self_registration";

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

const now = () => toDbDate(new Date("2026-11-21T12:00:00.000Z"), t.dialect);

describe("migration 0046_self_registration (190)", () => {
  it("makes the four tables, which take their rows", async () => {
    const pending = newId();
    await t.db
      .insertInto("pending_sign_ups")
      .values({
        id: pending,
        email: "ana@acme.example",
        name: "Ana",
        password_hash: null,
        locale: "pt",
        terms_version: "2026-11",
        terms_accepted_at: now(),
        created_at: now(),
        expires_at: now(),
      })
      .execute();
    await t.db
      .insertInto("email_codes")
      .values({
        id: newId(),
        purpose: "sign_up",
        subject_id: pending,
        email_hmac: "a".repeat(64),
        code_hmac: "b".repeat(64),
        created_at: now(),
        expires_at: now(),
        consumed_at: null,
      })
      .execute();
    await t.db
      .insertInto("challenges_used")
      .values({ challenge_hmac: "c".repeat(64), expires_at: now() })
      .execute();
    await t.db
      .insertInto("terms_acceptances")
      .values({ id: newId(), user_id: newId(), version: "2026-11", accepted_at: now() })
      .execute();
    const [code] = await t.db
      .selectFrom("email_codes")
      .select(["attempts", "consumed_at"])
      .execute();
    expect(code).toEqual({ attempts: 0, consumed_at: null });
    // A used challenge is taken once: its HMAC is the key.
    await expect(
      t.db
        .insertInto("challenges_used")
        .values({ challenge_hmac: "c".repeat(64), expires_at: now() })
        .execute(),
    ).rejects.toThrow();
  });

  it("adds the two user columns, empty for every existing account", async () => {
    const { id } = await createRoot(t.db, t.dialect, {
      email: "root@acme.example",
      name: "Root",
      password: "correct horse battery",
    });
    expect(
      await t.db
        .selectFrom("user")
        .select(["approval_pending_at", "signed_up_at"])
        .where("id", "=", id)
        .executeTakeFirstOrThrow(),
    ).toEqual({ approval_pending_at: null, signed_up_at: null });
  });

  it("indexes what the codes, the purge, erase and the approvals look up", async () => {
    expect(await indexes(t.db, "email_codes")).toEqual(
      expect.arrayContaining([
        "email_codes_subject_idx",
        "email_codes_email_idx",
        "email_codes_expires_idx",
      ]),
    );
    expect(await indexes(t.db, "pending_sign_ups")).toEqual(
      expect.arrayContaining(["pending_sign_ups_email_idx", "pending_sign_ups_expires_idx"]),
    );
    expect(await indexes(t.db, "challenges_used")).toEqual(
      expect.arrayContaining(["challenges_used_expires_idx"]),
    );
    expect(await indexes(t.db, "terms_acceptances")).toEqual(
      expect.arrayContaining(["terms_acceptances_user_idx"]),
    );
    expect(await indexes(t.db, "user")).toEqual(
      expect.arrayContaining(["user_approval_pending_idx"]),
    );
  });

  it("can run again over itself, as a rerun after a failure on MySQL does", async () => {
    await selfRegistration(t.dialect).up(t.db as unknown as Kysely<unknown>);
    expect(await indexes(t.db, "email_codes")).toEqual(
      expect.arrayContaining(["email_codes_subject_idx"]),
    );
  });
});
