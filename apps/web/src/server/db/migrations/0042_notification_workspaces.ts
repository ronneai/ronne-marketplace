import type { Kysely } from "kysely";
import { columnTypes } from "../column-types";
import type { AppMigration } from "./types";

/**
 * Where a notification's subject lived when it was written (feature 139): a JSON list of
 * workspace ids, at most two. When the subject is later deleted, the reader's right to see it is
 * still decided by these, so deleting a private workspace's item or request can't make an old
 * notification of it visible again. Null for notifications with no workspace (feedback) and for
 * rows written before it.
 */
export const notificationWorkspaces: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema.alterTable("notifications").addColumn("workspace_ids", t.text()).execute();
  },
});
