import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Erasing a user (feature 103): `user.erased_at` is set once, when root erases the account, and
 * never cleared. The row stays, under the pseudonym `deleted-user-<id>`, so the audit log and the
 * items that point at the id keep making sense; everything personal in it is gone, and every path
 * that signs in, enables or changes an account refuses one with this set.
 */
export const erasedAt: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema.alterTable("user").addColumn("erased_at", t.timestamp()).execute();
  },
});
