import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import { newId } from "../ids";
import type { AppMigration } from "./types";

/**
 * Plugin feeds at scale (feature 079):
 * - `catalogue_revision`: one row, a counter the item repository raises in the same transaction as
 *   every change that can change a plugin feed, so a cached marketplace knows when it's stale, and
 *   a random id for this database, so a cache never mistakes another database's revision for it;
 * - `plugin_feeds`: one row per tool, what its marketplace's last build measured, for the warnings
 *   and Admin › Settings.
 */
export const pluginFeeds: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("catalogue_revision")
      .addColumn("id", "integer", (c) => c.primaryKey())
      .addColumn("instance", t.id(), (c) => c.notNull())
      .addColumn("revision", "integer", (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    await db
      .insertInto("catalogue_revision" as never)
      .values({ id: 1, instance: newId(), revision: 0 } as never)
      .execute();
    await db.schema
      .createTable("plugin_feeds")
      .addColumn("tool", t.string(32), (c) => c.primaryKey())
      .addColumn("size_bytes", "integer", (c) => c.notNull())
      .addColumn("plugins", "integer", (c) => c.notNull())
      .addColumn("build_ms", "integer", (c) => c.notNull())
      .addColumn("revision", "integer", (c) => c.notNull())
      .addColumn("built_at", t.timestamp(), (c) => c.notNull())
      .addColumn("warned_revision", "integer")
      .$call(tableDefaults(dialect))
      .execute();
  },
});
