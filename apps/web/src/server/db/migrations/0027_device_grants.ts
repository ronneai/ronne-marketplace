import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * `rmk login --web` (feature 107): the device flow of RFC 8628. A row is one code `rmk` asked for.
 * Only the device code's SHA-256 hash is kept (`device_code_hash`); the user code is kept as typed
 * on the `/device` page (8 characters, short-lived, shown to the person anyway). `status` is
 * `pending`, `approved`, `denied`, `spent` (exchanged for a token), `voided` (too many wrong codes)
 * or `expired` (seen past `expires_at`). `user_id` is who approved or denied it; `requester_ip` and
 * `approver_ip` are set only when the address can be trusted (TRUST_PROXY). `interval_seconds` grows
 * on `slow_down`. A row goes with its user.
 *
 * `access_tokens.created_via`: how a token was made (`web`, `cli` or `device`), so Access tokens can
 * say *browser approval*. Null for tokens made before this migration.
 */
export const deviceGrants: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("device_grants")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("device_code_hash", t.string(64), (c) => c.notNull().unique())
      .addColumn("user_code", t.string(8), (c) => c.notNull().unique())
      .addColumn("client_id", t.string(16), (c) => c.notNull())
      .addColumn("name", t.string(100), (c) => c.notNull())
      .addColumn("status", t.string(16), (c) => c.notNull())
      .addColumn("user_id", t.id())
      .addForeignKeyConstraint("device_grants_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addColumn("requester_ip", t.string(45))
      .addColumn("approver_ip", t.string(45))
      .addColumn("interval_seconds", "integer", (c) => c.notNull())
      .addColumn("failed_attempts", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("last_polled_at", t.timestamp())
      .addColumn("decided_at", t.timestamp())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("expires_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    // Wrong codes count against every pending grant, and old rows are pruned by expiry.
    await db.schema
      .createIndex("device_grants_status_expires_at_idx")
      .on("device_grants")
      .columns(["status", "expires_at"])
      .execute();
    await db.schema
      .createIndex("device_grants_user_id_idx")
      .on("device_grants")
      .column("user_id")
      .execute();

    await db.schema.alterTable("access_tokens").addColumn("created_via", t.string(16)).execute();
  },
});
