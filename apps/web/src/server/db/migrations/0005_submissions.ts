import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Drafts and submissions (feature 012). Draft files live in the database, so a save is one
 * transaction and one backup covers everything; published packages go to the StorageAdapter (015).
 * Authors and scopes are RESTRICT: users are disabled, never deleted, and scopes are never deleted.
 * A submission's files go with it. Table-level foreign keys, as in 0001.
 */
export const submissions: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);

    await db.schema
      .createTable("submissions")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("author_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("submissions_author_id_fk", ["author_id"], "user", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("scope_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("submissions_scope_id_fk", ["scope_id"], "scopes", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .addColumn("name", t.string(64), (c) => c.notNull())
      .addColumn("type", t.string(32), (c) => c.notNull())
      .addColumn("item_id", t.id())
      .addColumn("base_version_id", t.id())
      .addColumn("status", t.string(24), (c) => c.notNull())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .addColumn("submitted_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("submissions_author_status_idx")
      .on("submissions")
      .columns(["author_id", "status"])
      .execute();
    await db.schema
      .createIndex("submissions_scope_name_idx")
      .on("submissions")
      .columns(["scope_id", "name"])
      .execute();

    await db.schema
      .createTable("submission_files")
      .addColumn("submission_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "submission_files_submission_id_fk",
        ["submission_id"],
        "submissions",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("path", t.string(255), (c) => c.notNull())
      .addPrimaryKeyConstraint("submission_files_pk", ["submission_id", "path"])
      .addColumn("encoding", t.string(8), (c) => c.notNull())
      .addColumn("content", t.longText(), (c) => c.notNull())
      .addColumn("size", "integer", (c) => c.notNull())
      .addColumn("executable", t.boolean(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
