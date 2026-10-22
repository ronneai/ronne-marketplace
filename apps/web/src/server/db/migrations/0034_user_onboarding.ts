import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * The Getting started checklist's state (feature 126): one row per person, made when they first
 * hide the panel, say they installed an item, or see "You're set up". No row means the defaults
 * (nothing hidden, confirmed or seen). Every step's own state is read from the tables it already
 * lives in (tokens, device grants, submissions), so nothing here needs back-filling. The row is
 * theirs alone and goes with the user row.
 */
export const userOnboarding: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("user_onboarding")
      .ifNotExists()
      .addColumn("user_id", t.id(), (c) => c.primaryKey())
      .addForeignKeyConstraint("user_onboarding_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("hidden_at", t.timestamp())
      .addColumn("install_confirmed_at", t.timestamp())
      .addColumn("completed_seen_at", t.timestamp())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
