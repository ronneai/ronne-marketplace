import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Usage reported by `rmk` (feature 046, MVP §14.6): daily totals only, kept 90 days. Nothing about
 * the person or the project is stored; a report adds its counts to the matching row. The primary
 * key starts with the item, so the item page (047) reads one item's days by its prefix. Usage goes
 * with its item, so the foreign key cascades.
 */
export const usage: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("usage_daily")
      .addColumn("item_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("usage_daily_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      // The UTC day, `YYYY-MM-DD`: compares as text on every database.
      .addColumn("day", t.string(10), (c) => c.notNull())
      .addColumn("version", t.exactString(64), (c) => c.notNull())
      .addColumn("tool", t.string(32), (c) => c.notNull())
      .addColumn("event", t.string(16), (c) => c.notNull())
      // For runs; "" for installs and removals. Not `trigger`, a reserved word in SQL.
      .addColumn("run_trigger", t.string(16), (c) => c.notNull())
      .addColumn("outcome", t.string(16), (c) => c.notNull())
      .addColumn("count", "integer", (c) => c.notNull())
      .addPrimaryKeyConstraint("usage_daily_pk", [
        "item_id",
        "day",
        "version",
        "tool",
        "event",
        "run_trigger",
        "outcome",
      ])
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema.createIndex("usage_daily_day_idx").on("usage_daily").column("day").execute();
  },
});
