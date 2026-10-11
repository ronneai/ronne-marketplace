import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

const mysqlHas = async (
  db: Kysely<unknown>,
  kind: "index" | "key",
  table: string,
  name: string,
) => {
  const result =
    kind === "index"
      ? await sql`select 1 from information_schema.statistics
          where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(
          db,
        )
      : await sql`select 1 from information_schema.referential_constraints
          where constraint_schema = database() and table_name = ${table}
            and constraint_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

const hasColumn = async (db: Kysely<unknown>, table: string, column: string) =>
  (await db.introspection.getTables())
    .find((t) => t.name === table)
    ?.columns.some((c) => c.name === column) ?? false;

/**
 * Moving a scope to another workspace (feature 115): one row per request, open until root or the
 * target's admins answer it, or it's cancelled; a move made at once is recorded too, approved.
 * At most one open move per scope: MySQL has no partial unique index, so the service checks it
 * under the scope's row lock. The rows go with their scope and their target workspace (cascade);
 * the source workspace is kept by id while it exists (a workspace is deleted only without scopes,
 * so after its last scope moved out) and set null then. `new_name` is the scope's name in the
 * target, its current name unless renamed for a clash. Users are disabled, never deleted: the
 * asker cascades as 094's requester does, and whoever answered is set null.
 */
const createScopeMoves = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await db.schema
    .createTable("scope_moves")
    .ifNotExists()
    .addColumn("id", t.id(), (c) => c.primaryKey())
    .addColumn("scope_id", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint("scope_moves_scope_id_fk", ["scope_id"], "scopes", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addColumn("from_workspace_id", t.id())
    .addForeignKeyConstraint(
      "scope_moves_from_workspace_id_fk",
      ["from_workspace_id"],
      "workspaces",
      ["id"],
      (fk) => fk.onDelete("set null"),
    )
    .addColumn("to_workspace_id", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint(
      "scope_moves_to_workspace_id_fk",
      ["to_workspace_id"],
      "workspaces",
      ["id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addColumn("requested_by", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint(
      "scope_moves_requested_by_fk",
      ["requested_by"],
      "user",
      ["id"],
      (fk) => fk.onDelete("cascade"),
    )
    .addColumn("new_name", t.string(64), (c) => c.notNull())
    .addColumn("message", t.text())
    .addColumn("status", t.string(16), (c) => c.notNull())
    .addColumn("decided_by", t.id())
    .addForeignKeyConstraint("scope_moves_decided_by_fk", ["decided_by"], "user", ["id"], (fk) =>
      fk.onDelete("set null"),
    )
    .addColumn("reason", t.text())
    .addColumn("created_at", t.timestamp(), (c) => c.notNull())
    .addColumn("decided_at", t.timestamp())
    .$call(tableDefaults(dialect))
    .execute();
  // A scope's open move (the rows on its workspace's page, one open per scope); the Requests page
  // and the nav count read the moves into a workspace.
  for (const [name, columns] of [
    ["scope_moves_scope_idx", ["scope_id", "status"]],
    ["scope_moves_to_idx", ["to_workspace_id", "status"]],
  ] as const)
    if (dialect !== "mysql" || !(await mysqlHas(db, "index", "scope_moves", name)))
      await db.schema
        .createIndex(name)
        .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
        .on("scope_moves")
        .columns([...columns])
        .execute();
};

/**
 * `item_versions.reviewed_by`: who approved moving a not-reviewed version (114) out of a personal
 * workspace, which makes it reviewed. Null for every other version. SQLite adds the column with its
 * foreign key in one statement, which it allows for a column that defaults to null; the servers add
 * the constraint after.
 */
const addReviewedBy = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  if (!(await hasColumn(db, "item_versions", "reviewed_by"))) {
    if (dialect === "sqlite")
      await sql`alter table item_versions add column reviewed_by varchar(26)
        references "user" (id) on delete set null`.execute(db);
    else await db.schema.alterTable("item_versions").addColumn("reviewed_by", t.id()).execute();
  }
  const exists =
    dialect === "postgres"
      ? (
          await sql`select 1 from pg_constraint con join pg_class rel on rel.oid = con.conrelid
            where rel.relname = 'item_versions' and con.conname = 'item_versions_reviewed_by_fk'`.execute(
            db,
          )
        ).rows.length > 0
      : dialect === "mysql"
        ? await mysqlHas(db, "key", "item_versions", "item_versions_reviewed_by_fk")
        : true;
  if (!exists)
    await db.schema
      .alterTable("item_versions")
      .addForeignKeyConstraint(
        "item_versions_reviewed_by_fk",
        ["reviewed_by"],
        "user",
        ["id"],
        (fk) => fk.onDelete("set null"),
      )
      .execute();
};

export const scopeMoves: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    await createScopeMoves(db, dialect);
    await addReviewedBy(db, dialect);
  },
});
