import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = 'rate_limits' and index_name = ${name}`.execute(
    db,
  );
  return result.rows.length > 0;
};

/**
 * Rate limit counters (feature 109), shared by every replica and kept across restarts: one row per
 * limit and key, its key a keyed hash (never an email, an address or an ID), the attempts counted
 * in its window, and when the window ends. No foreign keys: a row belongs to no table. The
 * retention purge deletes rows whose window has ended, by `expires_at`.
 */
export const rateLimits: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("rate_limits")
      .ifNotExists()
      .addColumn("key_hash", t.string(64), (c) => c.primaryKey())
      .addColumn("window_started_at", t.timestamp(), (c) => c.notNull())
      .addColumn("hits", "integer", (c) => c.notNull())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    // The purge's look-up: rows whose window has ended.
    const index = "rate_limits_expires_idx";
    if (dialect !== "mysql" || !(await mysqlHasIndex(db, index)))
      await db.schema
        .createIndex(index)
        .$call((i) => (dialect === "mysql" ? i : i.ifNotExists()))
        .on("rate_limits")
        .column("expires_at")
        .execute();
  },
});
