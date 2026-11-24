import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, table: string, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

/**
 * Forgot password by email (feature 194): `password_reset_flows`, one row per request, even for an
 * address that gets no code, so every request does the same work. The browser holds 32 random
 * bytes in a cookie and the row only their SHA-256 (`token_hash`), so a database read can't
 * continue a flow. No email address and no IP are kept. `user_id` is null for an address that gets
 * no code; a deleted user takes their flows (cascade). The codes are 190's `email_codes`, purpose
 * `password_reset`. The setting keeps its default in code (off), so no setting row is written here.
 */
export const passwordResetFlows: AppMigration = (dialect: DatabaseDialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("password_reset_flows")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("token_hash", t.string(64), (c) => c.notNull().unique())
      .addColumn("user_id", t.id())
      .addForeignKeyConstraint(
        "password_reset_flows_user_id_fk",
        ["user_id"],
        "user",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      // `code`, `two_factor` or `new_password`.
      .addColumn("step", t.string(16), (c) => c.notNull())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      // When the account's two-factor step was passed: a flow that skipped it, two-factor being
      // off then, is sent back to it if two-factor is on by the new-password step.
      .addColumn("two_factor_at", t.timestamp())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    // An account's flows (a reset ends them, erasure, your data); the purge (102).
    for (const [name, columns] of [
      ["password_reset_flows_user_idx", ["user_id"]],
      ["password_reset_flows_expires_idx", ["expires_at"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, "password_reset_flows", name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("password_reset_flows")
          .columns([...columns])
          .execute();
  },
});
