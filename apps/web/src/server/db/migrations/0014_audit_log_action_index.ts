import type { Kysely } from "kysely";
import type { AppMigration } from "./types";

/**
 * The audit log sorts by action (feature 060): keyset pages order by the action, then the id, so
 * the index covers both. Sorting by time uses the id alone (ULIDs sort by creation time).
 */
export const auditLogActionIndex: AppMigration = () => ({
  async up(db: Kysely<unknown>) {
    await db.schema
      .createIndex("audit_log_action_id_idx")
      .on("audit_log")
      .columns(["action", "id"])
      .execute();
  },
});
