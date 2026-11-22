import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, table: string, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

/** Whether the column exists yet: the same reason, for the two columns added to `user`. */
const hasColumn = async (db: Kysely<unknown>, dialect: string, table: string, name: string) => {
  if (dialect === "sqlite") {
    const { rows } = await sql<{
      name: string;
    }>`select name from pragma_table_info(${table})`.execute(db);
    return rows.some((r) => r.name === name);
  }
  const { rows } = await sql`select 1 from information_schema.columns
    where table_name = ${table} and column_name = ${name}
    and table_schema = ${dialect === "postgres" ? sql`current_schema()` : sql`database()`}`.execute(
    db,
  );
  return rows.length > 0;
};

/**
 * Self-registration (feature 190):
 * - `pending_sign_ups`: a sign-up until its code is right; nothing is in `user` before that. The
 *   password hash is null for an address that already has an account (the same answer, no code
 *   that works).
 * - `email_codes`: one-time codes by email, shared with 194 (forgot password) and 197 (email
 *   change); only an HMAC of the code and of the address is kept.
 * - `challenges_used`: proof-of-work answers already taken, so none is used twice.
 * - `terms_acceptances`: every acceptance of the terms, one row each, never updated.
 * - `user.approval_pending_at` and `user.signed_up_at`.
 * The settings keep their defaults in code (sign-up off), so no setting row is written here.
 */
export const selfRegistration: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("pending_sign_ups")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("email", t.string(254), (c) => c.notNull())
      .addColumn("name", t.string(200), (c) => c.notNull())
      .addColumn("password_hash", t.text())
      .addColumn("locale", t.string(16), (c) => c.notNull())
      .addColumn("terms_version", t.string(64))
      .addColumn("terms_accepted_at", t.timestamp())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createTable("email_codes")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("purpose", t.string(32), (c) => c.notNull())
      .addColumn("subject_id", t.id(), (c) => c.notNull())
      .addColumn("email_hmac", t.string(64), (c) => c.notNull())
      .addColumn("code_hmac", t.string(64), (c) => c.notNull())
      .addColumn("attempts", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .addColumn("consumed_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createTable("challenges_used")
      .ifNotExists()
      .addColumn("challenge_hmac", t.string(64), (c) => c.primaryKey())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createTable("terms_acceptances")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addColumn("version", t.string(64), (c) => c.notNull())
      .addColumn("accepted_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    for (const column of ["approval_pending_at", "signed_up_at"])
      if (!(await hasColumn(db, dialect, "user", column)))
        await db.schema.alterTable("user").addColumn(column, t.timestamp()).execute();
    // A subject's codes (the one to check, the 60 seconds); the hourly cap by address; the purge
    // of each table; a pending sign-up by address; a person's acceptances (erase, your data); the
    // accounts awaiting approval (the list's filter, the 30-day decline).
    for (const [table, name, columns] of [
      ["email_codes", "email_codes_subject_idx", ["purpose", "subject_id", "created_at"]],
      ["email_codes", "email_codes_email_idx", ["purpose", "email_hmac", "created_at"]],
      ["email_codes", "email_codes_expires_idx", ["expires_at"]],
      ["pending_sign_ups", "pending_sign_ups_email_idx", ["email"]],
      ["pending_sign_ups", "pending_sign_ups_expires_idx", ["expires_at"]],
      ["challenges_used", "challenges_used_expires_idx", ["expires_at"]],
      ["terms_acceptances", "terms_acceptances_user_idx", ["user_id", "accepted_at"]],
      ["user", "user_approval_pending_idx", ["approval_pending_at"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, table, name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on(table)
          .columns([...columns])
          .execute();
  },
});
