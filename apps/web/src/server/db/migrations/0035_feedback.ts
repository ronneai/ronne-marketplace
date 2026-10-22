import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = 'feedback' and index_name = ${name}`.execute(
    db,
  );
  return result.rows.length > 0;
};

/**
 * Feedback to the instance's administrators (feature 127): what a signed-in person writes from the
 * Send feedback dialog, and root reads in Admin. The message is plain text. A sender's rows go with
 * the user row (erasing a person deletes their feedback, 103); the one who marked a row handled is
 * forgotten when they go, the row stays.
 */
export const feedback: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("feedback")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addColumn("kind", t.string(16), (c) => c.notNull())
      .addColumn("message", t.text(), (c) => c.notNull())
      .addColumn("page", t.string(200))
      .addColumn("version", t.string(64), (c) => c.notNull())
      .addColumn("status", t.string(16), (c) => c.notNull().defaultTo("new"))
      .addColumn("handled_by", t.id())
      .addColumn("handled_at", t.timestamp())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addForeignKeyConstraint("feedback_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addForeignKeyConstraint("feedback_handled_by_fk", ["handled_by"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .$call(tableDefaults(dialect))
      .execute();
    // The inbox: by status and kind, newest first; and a person's own rows (data download, erase).
    for (const [name, columns] of [
      ["feedback_status_idx", ["status", "id"]],
      ["feedback_kind_idx", ["kind", "id"]],
      ["feedback_user_idx", ["user_id", "id"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("feedback")
          .columns([...columns])
          .execute();
  },
});
