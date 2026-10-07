import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import { toDbDate } from "../dates";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import type { AppMigration } from "./types";

/** Whether the index exists yet (MySQL commits each DDL statement, so a failed run is rerun). */
const mysqlHasIndex = async (db: Kysely<unknown>, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = 'workspace_members' and index_name = ${name}`.execute(
    db,
  );
  return result.rows.length > 0;
};

/**
 * Roles per workspace (feature 091): moderator and user become roles in a workspace, and
 * `user.role` keeps only `root` or `user`. Every user who isn't root becomes a member of `global`,
 * a moderator there if they were a moderator; roots get no rows (they're in every workspace).
 * Each step can run again, for MySQL, where a failed run leaves the steps before it done.
 */
export const workspaceMembers: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    const t = columnTypes(dialect);
    await db.schema
      .createTable("workspace_members")
      .ifNotExists()
      .addColumn("workspace_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint(
        "workspace_members_workspace_id_fk",
        ["workspace_id"],
        "workspaces",
        ["id"],
        (fk) => fk.onDelete("cascade"),
      )
      .addColumn("user_id", t.id(), (c) => c.notNull())
      .addForeignKeyConstraint("workspace_members_user_id_fk", ["user_id"], "user", ["id"], (fk) =>
        fk.onDelete("cascade"),
      )
      .addPrimaryKeyConstraint("workspace_members_pk", ["workspace_id", "user_id"])
      .addColumn("role", t.string(16), (c) => c.notNull())
      .addColumn("added_by", t.id())
      .addForeignKeyConstraint(
        "workspace_members_added_by_fk",
        ["added_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .addColumn("created_at", t.timestamp(), (c) => c.notNull())
      .addColumn("updated_at", t.timestamp(), (c) => c.notNull())
      .$call(tableDefaults(dialect))
      .execute();
    // A user's memberships are read on every request; the key leads with the workspace.
    if (dialect !== "mysql" || !(await mysqlHasIndex(db, "workspace_members_user_id_idx")))
      await db.schema
        .createIndex("workspace_members_user_id_idx")
        .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
        .on("workspace_members")
        .column("user_id")
        .execute();

    const now = toDbDate(new Date(), dialect);
    const users = await db
      .selectFrom("user as u" as never)
      .select([sql<string>`u.id`.as("id"), sql<string>`u.role`.as("role")])
      .where(sql`u.role`, "<>", "root")
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("workspace_members as m" as never)
              .select(sql`1`.as("one"))
              .where(sql`m.workspace_id`, "=", GLOBAL_WORKSPACE_ID)
              .where(sql`m.user_id`, "=", sql.ref("u.id")),
          ),
        ),
      )
      .execute();
    // In batches, under every database's limit on bound parameters.
    for (let i = 0; i < users.length; i += 500)
      await db
        .insertInto("workspace_members" as never)
        .values(
          users.slice(i, i + 500).map((u) => ({
            workspace_id: GLOBAL_WORKSPACE_ID,
            user_id: u.id,
            role: u.role === "moderator" ? "moderator" : "user",
            added_by: null,
            created_at: now,
            updated_at: now,
          })) as never,
        )
        .execute();
    await sql`update ${sql.table("user")} set role = 'user' where role = 'moderator'`.execute(db);
  },
});
