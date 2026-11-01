import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = 'notifications' and index_name = ${name}`.execute(
    db,
  );
  return result.rows.length > 0;
};

/**
 * The notification center's rows (feature 139): one per recipient, holding the kind and its
 * parameters, never a sentence (the sentence is drawn in the reader's language when read). A
 * person's rows go with the user row (erasing a person deletes them, 103); the actor is forgotten
 * when they go and the row stays, the name being read when shown.
 */
export const notifications: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("notifications")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addColumn("kind", t.string(48), (c) => c.notNull())
      .addColumn("actor_id", t.id())
      .addColumn("subject_type", t.string(32), (c) => c.notNull())
      .addColumn("subject_id", t.string(64), (c) => c.notNull())
      .addColumn("params", t.text(), (c) => c.notNull())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("read_at", t.timestamp())
      .addForeignKeyConstraint("notifications_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addForeignKeyConstraint("notifications_actor_id_fk", ["actor_id"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .$call(tableDefaults(dialect))
      .execute();
    // The unread count, a person's list newest first (the id is a ULID, so it is time order), and
    // the purge by age.
    for (const [name, columns] of [
      ["notifications_unread_idx", ["user_id", "read_at", "created_at"]],
      ["notifications_user_idx", ["user_id", "id"]],
      ["notifications_created_idx", ["created_at"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("notifications")
          .columns([...columns])
          .execute();
  },
});
