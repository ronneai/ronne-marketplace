import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Instance settings that root changes in the app (feature 046's usage policy first): one row per
 * setting, written on change. A missing row means the setting's default, so a new instance needs
 * no seed. Who changed it last sets null when that user goes; the audit log keeps the history.
 */
export const instanceSettings: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("instance_settings")
      .addColumn("key", t.string(64), (c) => c.primaryKey())
      .addColumn("value", t.text(), (c) => c.notNull())
      .addColumn("updated_by", t.id())
      .addForeignKeyConstraint(
        "instance_settings_updated_by_fk",
        ["updated_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
