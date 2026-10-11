import { personalWorkspaceName } from "@ronneai/core";
import { type Kysely, sql } from "kysely";
import { columnTypes } from "../column-types";
import { toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import type { DatabaseDialect } from "../url";
import type { AppMigration } from "./types";

/** Users given a workspace per batch: their workspaces and memberships are inserted together. */
const BATCH = 500;

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
 * `workspaces.owner_id`: the user a personal workspace belongs to, null for `global` and the shared
 * ones; one per user (a unique index, which lets many nulls through), and RESTRICT, since users are
 * disabled, never deleted. SQLite adds the column with its foreign key in one statement, which it
 * allows for a column that defaults to null; the servers add the constraint after.
 */
const addOwner = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  if (!(await hasColumn(db, "workspaces", "owner_id"))) {
    if (dialect === "sqlite")
      await sql`alter table workspaces add column owner_id varchar(26)
        references "user" (id) on delete restrict`.execute(db);
    else await db.schema.alterTable("workspaces").addColumn("owner_id", t.id()).execute();
  }
  if (
    dialect !== "mysql" ||
    !(await mysqlHas(db, "index", "workspaces", "workspaces_owner_unique"))
  )
    await db.schema
      .createIndex("workspaces_owner_unique")
      .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
      .unique()
      .on("workspaces")
      .column("owner_id")
      .execute();
  if (
    dialect === "postgres" &&
    (
      await sql`select 1 from pg_constraint con join pg_class rel on rel.oid = con.conrelid
        where rel.relname = 'workspaces' and con.conname = 'workspaces_owner_id_fk'`.execute(db)
    ).rows.length === 0
  )
    await db.schema
      .alterTable("workspaces")
      .addForeignKeyConstraint("workspaces_owner_id_fk", ["owner_id"], "user", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .execute();
  if (dialect === "mysql" && !(await mysqlHas(db, "key", "workspaces", "workspaces_owner_id_fk")))
    await db.schema
      .alterTable("workspaces")
      .addForeignKeyConstraint("workspaces_owner_id_fk", ["owner_id"], "user", ["id"], (fk) =>
        fk.onDelete("restrict"),
      )
      .execute();
};

/**
 * `item_versions.reviewed`: false for a version released from a personal workspace without review
 * (114, decision 3). Every version so far was reviewed.
 */
const addReviewed = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  if (!(await hasColumn(db, "item_versions", "reviewed")))
    await db.schema
      .alterTable("item_versions")
      .addColumn("reviewed", t.boolean(), (c) =>
        c.notNull().defaultTo(dialect === "sqlite" ? 1 : true),
      )
      .execute();
};

/**
 * A personal workspace for every user who has none (114), roots too, oldest first: private, its
 * owner its only member, as admin. Named from the email (`personalWorkspaceName`), the first name no
 * workspace has; in batches, so a large instance doesn't build one huge statement. Skips users who
 * have one, so a rerun (MySQL commits each DDL statement) adds nothing twice.
 */
const givePersonalWorkspaces = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const taken = new Set(
    (await sql<{ name: string }>`select name from workspaces`.execute(db)).rows.map((r) => r.name),
  );
  const users = (
    await sql<{ id: string; email: string }>`
      select id, email from ${sql.table("user")}
      where id not in (select owner_id from workspaces where owner_id is not null)
      order by created_at, id`.execute(db)
  ).rows;
  const now = toDbDate(new Date(), dialect);
  const no = toDbBoolean(false, dialect);
  for (let at = 0; at < users.length; at += BATCH) {
    const batch = users.slice(at, at + BATCH).map((user) => {
      let attempt = 0;
      let name = personalWorkspaceName(user.email, attempt);
      while (taken.has(name)) name = personalWorkspaceName(user.email, ++attempt);
      taken.add(name);
      return { user, id: newId(), name };
    });
    await db
      .insertInto("workspaces" as never)
      .values(
        batch.map(({ user, id, name }) => ({
          id,
          name,
          description: `${name}'s personal workspace`,
          visibility: "private",
          is_global: no,
          owner_id: user.id,
          created_by: null,
          created_at: now,
          updated_at: now,
        })) as never,
      )
      .execute();
    await db
      .insertInto("workspace_members" as never)
      .values(
        batch.map(({ user, id }) => ({
          workspace_id: id,
          user_id: user.id,
          role: "admin",
          added_by: null,
          created_at: now,
          updated_at: now,
        })) as never,
      )
      .execute();
  }
};

/**
 * The owner's admin row for every personal workspace without one: a run stopped between a batch's
 * two inserts (SQLite and MySQL commit each) leaves workspaces whose owners the next run skips.
 */
const ownersAsAdmins = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const missing = (
    await sql<{ id: string; owner_id: string }>`
      select w.id as id, w.owner_id as owner_id from workspaces w
      where w.owner_id is not null and not exists (
        select 1 from workspace_members m
        where m.workspace_id = w.id and m.user_id = w.owner_id)`.execute(db)
  ).rows;
  const now = toDbDate(new Date(), dialect);
  for (let at = 0; at < missing.length; at += BATCH)
    await db
      .insertInto("workspace_members" as never)
      .values(
        missing.slice(at, at + BATCH).map((row) => ({
          workspace_id: row.id,
          user_id: row.owner_id,
          role: "admin",
          added_by: null,
          created_at: now,
          updated_at: now,
        })) as never,
      )
      .execute();
};

/**
 * Personal workspaces (feature 114): `workspaces.owner_id`, `item_versions.reviewed`, and one
 * private workspace for every user, with the user as its admin.
 */
export const personalWorkspaces: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    await addOwner(db, dialect);
    await addReviewed(db, dialect);
    await givePersonalWorkspaces(db, dialect);
    await ownersAsAdmins(db, dialect);
  },
});
