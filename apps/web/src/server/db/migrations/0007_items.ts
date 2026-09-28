import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Published items (feature 015, MVP §10). An item is created by its first release; each release adds
 * an immutable version, whose `.tgz` lives in the StorageAdapter. `readme` and `files` are copied at
 * publish time, so pages never unpack an artifact. Nothing here is ever deleted, so every foreign
 * key is RESTRICT, except an item's owner, which sets null. Table-level foreign keys, as in 0001.
 */
export const items: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);

    await db.schema
      .createTable("items")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("scope_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("items_scope_id_fk", ["scope_id"], "scopes", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("name", t.string(64), (c) => c.notNull())
      .addColumn("type", t.string(32), (c) => c.notNull())
      .addColumn("description", t.string(300), (c) => c.notNull())
      .addColumn("owner_id", t.id())
      .addForeignKeyConstraint("items_owner_id_fk", ["owner_id"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addUniqueConstraint("items_scope_name_unique", ["scope_id", "name"])
      .$call(tableDefaults(dialect))
      .execute();

    await db.schema
      .createTable("item_versions")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("item_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("item_versions_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("version", t.exactString(64), (c) => c.notNull())
      .addColumn("manifest", t.longText(), (c) => c.notNull())
      .addColumn("readme", t.longText())
      .addColumn("files", t.longText(), (c) => c.notNull())
      .addColumn("notes", t.text())
      .addColumn("artifact_path", t.string(512), (c) => c.notNull())
      .addColumn("sha256", t.string(64), (c) => c.notNull())
      .addColumn("size", "integer", (c) => c.notNull())
      .addColumn("published_by", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "item_versions_published_by_fk",
        ["published_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .addColumn("published_at", t.timestamp(), (c) => c.notNull())
      .addColumn("deprecated_message", t.string(300))
      .addColumn("yanked_at", t.timestamp())
      .addColumn("submission_id", t.id())
      .addForeignKeyConstraint(
        "item_versions_submission_id_fk",
        ["submission_id"],
        "submissions",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .addUniqueConstraint("item_versions_item_version_unique", ["item_id", "version"])
      .$call(tableDefaults(dialect))
      .execute();

    await db.schema
      .createTable("dist_tags")
      .addColumn("item_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("dist_tags_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("tag", t.exactString(32), (c) => c.notNull())
      .addPrimaryKeyConstraint("dist_tags_pk", ["item_id", "tag"])
      .addColumn("version_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "dist_tags_version_id_fk",
        ["version_id"],
        "item_versions",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .$call(tableDefaults(dialect))
      .execute();

    await db.schema
      .createTable("version_dependencies")
      .addColumn("version_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "version_dependencies_version_id_fk",
        ["version_id"],
        "item_versions",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .addColumn("depends_on_item_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "version_dependencies_depends_on_fk",
        ["depends_on_item_id"],
        "items",
        ["id"],
        (fk) => fk.onDelete("restrict"),
      )
      .addPrimaryKeyConstraint("version_dependencies_pk", ["version_id", "depends_on_item_id"])
      .addColumn("range", t.string(128), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
