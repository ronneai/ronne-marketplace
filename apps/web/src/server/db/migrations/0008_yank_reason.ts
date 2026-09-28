import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/** Why a version was yanked (feature 016), shown on its Versions page next to the yank. */
export const yankReason: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema.alterTable("item_versions").addColumn("yank_reason", t.string(300)).execute();
  },
});
