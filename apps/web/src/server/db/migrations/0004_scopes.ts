import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Scopes (feature 010): the `@name` every item lives in. Names are stored without the `@`, and are
 * unique. `created_by` sets null if the user row is ever deleted, so the scope stays. Table-level
 * foreign key, as in 0001 and 0002.
 */
export const scopes: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("scopes")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("name", t.string(64), (c) => c.notNull().unique())
      .addColumn("description", t.string(300), (c) => c.notNull())
      .addColumn("created_by", t.id())
      .addForeignKeyConstraint("scopes_created_by_fk", ["created_by"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
  },
});
