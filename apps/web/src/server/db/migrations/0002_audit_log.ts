import type { Kysely } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/**
 * The audit log (feature 007): who did what, when and from where. Rows are only ever inserted;
 * nothing in the app updates or deletes them (audit-log.guard.test.ts). The actor's foreign key
 * sets null if a user row is ever deleted, so the event stays. Table-level, like 0001's.
 */
export const auditLog: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);

    await db.schema
      .createTable("audit_log")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("actor_id", t.id())
      .addForeignKeyConstraint("audit_log_actor_id_fk", ["actor_id"], "user", ["id"], (fk) =>
        fk.onDelete("set null"),
      )
      .addColumn("action", t.string(64), (c) => c.notNull())
      .addColumn("target_type", t.string(32), (c) => c.notNull())
      .addColumn("target_id", t.string(64))
      .addColumn("metadata", t.json(), (c) => c.notNull())
      .addColumn("ip_address", t.string(45))
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    await db.schema
      .createIndex("audit_log_created_at_idx")
      .on("audit_log")
      .column("created_at")
      .execute();
    await db.schema
      .createIndex("audit_log_target_idx")
      .on("audit_log")
      .columns(["target_type", "target_id"])
      .execute();
    await db.schema
      .createIndex("audit_log_actor_id_idx")
      .on("audit_log")
      .column("actor_id")
      .execute();
  },
});
