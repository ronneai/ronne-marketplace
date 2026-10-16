import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Two-factor sign-in (feature 105): Better Auth's `twoFactor` plugin, with our snake_case names
 * (`twoFactorSchema` in domains/identity/models/auth-schema.ts, checked in 0025_two_factor.db.test.ts).
 * At most one row per user (a unique index), made when they start enrolling: the TOTP secret and the backup codes, both encrypted by
 * Better Auth with a key from AUTH_SECRET; `verified` until the first code; the failed-code count
 * and when the lock ends (the plugin's `lockedUntil`, named `…_at` like every timestamp, for
 * restore). The row goes with its user. `user.two_factor_enabled` is the plugin's flag.
 */
export const twoFactor: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .alterTable("user")
      .addColumn("two_factor_enabled", t.boolean(), (c) => c.notNull().defaultTo(false))
      .execute();

    await db.schema
      .createTable("two_factor")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("two_factor_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("secret", t.text(), (c) => c.notNull())
      .addColumn("backup_codes", t.text(), (c) => c.notNull())
      .addColumn("verified", t.boolean(), (c) => c.notNull().defaultTo(true))
      .addColumn("failed_verification_count", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("lock_expires_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    // Unique: the plugin finds a user's row by user_id, so two enrolments at once must not leave
    // two rows, one of them matching an authenticator nobody uses.
    await db.schema
      .createIndex("two_factor_user_id_idx")
      .on("two_factor")
      .column("user_id")
      .unique()
      .execute();
  },
});
