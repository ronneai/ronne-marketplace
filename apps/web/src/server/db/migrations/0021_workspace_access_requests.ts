import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = 'workspace_access_requests'
    and index_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

/**
 * Asking to join a workspace (feature 094): one row per request, open until root or the
 * workspace's moderators answer it, or the requester cancels it. At most one open request per user
 * and workspace: MySQL has no partial unique index, so the service checks it under the requester's
 * row lock. The rows go with their workspace and their user (both cascade). A request to a name no
 * workspace has is kept too, by name, with no workspace (so asking can't tell an unknown name from
 * a private one); it joins the workspace if one is created with that name.
 */
export const workspaceAccessRequests: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("workspace_access_requests")
      .ifNotExists()
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("workspace_id", t.id())
      .addForeignKeyConstraint(
        "workspace_access_requests_workspace_id_fk",
        ["workspace_id"],
        "workspaces",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("workspace_name", t.string(64), (c) => c.notNull())
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "workspace_access_requests_user_id_fk",
        ["user_id"],
        "user",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("message", t.text())
      .addColumn("status", t.string(16), (c) => c.notNull())
      .addColumn("decided_by", t.id())
      .addForeignKeyConstraint(
        "workspace_access_requests_decided_by_fk",
        ["decided_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .addColumn("reason", t.text())
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("decided_at", t.timestamp())
      .$call(tableDefaults(dialect))
      .execute();
    // The Requests tab and the nav count read a workspace's open requests; the Workspaces page, the
    // limits and asking again read a user's, by workspace name.
    for (const [name, columns] of [
      ["workspace_access_requests_workspace_idx", ["workspace_id", "status"]],
      ["workspace_access_requests_user_idx", ["user_id", "workspace_name"]],
    ] as const)
      if (dialect !== "mysql" || !(await mysqlHasIndex(db, name)))
        await db.schema
          .createIndex(name)
          .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
          .on("workspace_access_requests")
          .columns([...columns])
          .execute();
  },
});
