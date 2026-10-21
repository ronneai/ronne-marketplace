import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, table: string, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

/**
 * Favorites and pins (feature 125). `item_favorites` is a person's own list: one row per user and
 * item, gone with either. `item_pins` is a shelf of items root or a workspace's admins chose:
 * `workspace_id` is null for the instance's "Start here" shelf. A unique key can't hold a null, so
 * `shelf` is the same shelf as a plain key (the workspace's id, or `instance`; a ULID can't be
 * `instance`), and it is what the key on (`shelf`, `item_id`) uses. `position` is kept dense by the
 * repository, not by a key, because swapping two positions would break a unique one halfway.
 * Pins go with their item and their workspace; `created_by` is set null if the user row is deleted
 * (erasing keeps the row, under a pseudonym, so the pin keeps pointing at it).
 */
export const pinsAndFavorites: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("item_favorites")
      .ifNotExists()
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("item_favorites_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("item_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("item_favorites_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addPrimaryKeyConstraint("item_favorites_pk", ["user_id", "item_id"])
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createTable("item_pins")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("workspace_id", t.id())
      .addForeignKeyConstraint(
        "item_pins_workspace_id_fk",
        ["workspace_id"],
        "workspaces",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("shelf", t.string(26), (c) => c.notNull())
      .addColumn("item_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("item_pins_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("position", "integer", (c) => c.notNull())
      .addColumn("created_by", t.id())
      .addForeignKeyConstraint("item_pins_created_by_fk", ["created_by"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addUniqueConstraint("item_pins_shelf_item_key", ["shelf", "item_id"])
      .$call(tableDefaults(dialect))
      .execute();
    // Deleting an item looks for its favorites and pins by item; a workspace's cascade, by workspace.
    for (const [table, name, column] of [
      ["item_favorites", "item_favorites_item_idx", "item_id"],
      ["item_pins", "item_pins_item_idx", "item_id"],
      ["item_pins", "item_pins_workspace_idx", "workspace_id"],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, table, name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on(table)
          .column(column)
          .execute();
  },
});
