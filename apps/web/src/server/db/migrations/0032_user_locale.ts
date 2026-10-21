import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * A person's language (feature 129): `user.locale` is `en`, `pt` or `fr`, or null for automatic,
 * which follows the browser. It is a preference, so nothing depends on it and a value the app no
 * longer supports counts as null.
 */
export const userLocale: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema.alterTable("user").addColumn("locale", t.string(8)).execute();
  },
});
