import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Change the password at first sign-in (feature 128): `user.password_change_required_at` is set
 * when root creates an account or resets a password and asks for the new password to be replaced,
 * and cleared when the person sets their own. Null (every existing account) means nothing is asked.
 */
export const passwordChangeRequired: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .alterTable("user")
      .addColumn("password_change_required_at", t.timestamp())
      .execute();
  },
});
