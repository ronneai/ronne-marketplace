import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Erasures in progress (feature 103): one row per account being erased, made in the erasure's
 * transaction and deleted when the audit log's rewrite of the person's email is done and
 * `user.erased` is recorded. On PostgreSQL and SQLite that's the same transaction, so a row is
 * never seen; on MySQL and MariaDB the rewrite runs in batches after the commit, so a crash in
 * between leaves the row: the old address it holds is what the rewrite looks for, `counts` (JSON)
 * what the event will say, and `events_rewritten` how far it got. The Privacy tab shows such rows
 * with a Retry, and the retention job finishes them.
 */
export const userErasures: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("user_erasures")
      .addColumn("user_id", t.id(), (c) => c.primaryKey())
      .addForeignKeyConstraint("user_erasures_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("email", t.string(255), (c) => c.notNull())
      .addColumn("counts", t.json(), (c) => c.notNull())
      .addColumn("events_rewritten", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("actor_id", t.id())
      .addColumn("started_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
