import { type Kysely, sql } from "kysely";
import { columnTypes, tableDefaults } from "../column-types";
import { toDbDate } from "../dates";
import type { DatabaseDialect } from "../url";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import type { AppMigration } from "./types";

/** The longest full item name: `@` and three names of 64 with two slashes (118). */
const ITEM_NAME_LENGTH = 195;

/** The tables whose foreign keys the SQLite rebuild touches: scopes' own, and the two pointing at it. */
const REBUILT_KEYS = ["scopes", "items", "submissions"];

/**
 * Old names (118): a full item name an item answered to before a move or a rename, pointing at the
 * item. A name here is reserved: no other item may take it. Exact strings, since names are stored
 * canonical and lowercase.
 */
const createAliases = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await db.schema
    .createTable("item_aliases")
    .ifNotExists()
    .addColumn("name", t.exactString(ITEM_NAME_LENGTH), (c) => c.primaryKey())
    .addColumn("item_id", t.id(), (c) => c.notNull())
    .addForeignKeyConstraint("item_aliases_item_id_fk", ["item_id"], "items", ["id"], (fk) =>
      fk.onDelete("cascade"),
    )
    .addColumn("reason", t.string(16), (c) => c.notNull())
    .addColumn("created_at", t.timestamp(), (c) => c.notNull())
    .$call(tableDefaults(dialect))
    .execute();
};

/**
 * Every item outside `global` keeps the name it had before 118, `@scope/name`, as an alias, so
 * lockfiles, dependencies and links written before keep finding it. Read in JavaScript and written
 * in batches, so no dialect's string concatenation is needed. Skips names already there, so a rerun
 * (MySQL commits each DDL statement) adds nothing twice.
 */
const writeOldNames = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const rows = (
    await sql<{ id: string; scope: string; name: string }>`
    select items.id as id, scopes.name as scope, items.name as name
    from items join scopes on scopes.id = items.scope_id
    where scopes.workspace_id <> ${GLOBAL_WORKSPACE_ID}
      and items.id not in (select item_id from item_aliases where reason = 'migration')`.execute(db)
  ).rows;
  const now = toDbDate(new Date(), dialect);
  for (let at = 0; at < rows.length; at += 500)
    await db
      .insertInto("item_aliases" as never)
      .values(
        rows.slice(at, at + 500).map((row) => ({
          name: `@${row.scope}/${row.name}`,
          item_id: row.id,
          reason: "migration",
          created_at: now,
        })) as never,
      )
      .execute();
};

/**
 * SQLite can't drop a column's UNIQUE, so `scopes` is rebuilt as in 0019: foreign keys off for the
 * connection, everything in one transaction, then a foreign key check before committing.
 */
const migrateSqlite = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  const t = columnTypes(dialect);
  await sql`pragma foreign_keys = off`.execute(db);
  try {
    await sql`begin`.execute(db);
    try {
      await db.schema
        .createTable("scopes_new")
        .addColumn("id", t.id(), (c) => c.primaryKey())
        .addColumn("name", t.string(64), (c) => c.notNull())
        .addColumn("description", t.string(300), (c) => c.notNull())
        .addColumn("created_by", t.id())
        .addForeignKeyConstraint("scopes_created_by_fk", ["created_by"], "user", ["id"], (fk) =>
          fk.onDelete("set null"),
        )
        .addColumn("created_at", t.timestamp(), (c) => c.notNull())
        .addColumn("workspace_id", t.id(), (c) => c.notNull())
        .addForeignKeyConstraint(
          "scopes_workspace_id_fk",
          ["workspace_id"],
          "workspaces",
          ["id"],
          (fk) => fk.onDelete("restrict"),
        )
        .addUniqueConstraint("scopes_workspace_name_unique", ["workspace_id", "name"])
        .execute();
      await sql`insert into scopes_new (id, name, description, created_by, created_at, workspace_id)
        select id, name, description, created_by, created_at, workspace_id from scopes`.execute(db);
      await db.schema.dropTable("scopes").execute();
      await db.schema.alterTable("scopes_new").renameTo("scopes").execute();
      await db.schema
        .createIndex("scopes_workspace_id_idx")
        .on("scopes")
        .column("workspace_id")
        .execute();
      for (const table of REBUILT_KEYS) {
        const broken = await sql`select * from pragma_foreign_key_check(${table})`.execute(db);
        if (broken.rows.length > 0)
          throw new Error(
            `${broken.rows.length} rows of ${table} point at rows that don't exist; fix them, then start again.`,
          );
      }
      await createAliases(db, dialect);
      await db.schema
        .createIndex("item_aliases_item_idx")
        .ifNotExists()
        .on("item_aliases")
        .column("item_id")
        .execute();
      await writeOldNames(db, dialect);
      await sql`commit`.execute(db);
    } catch (error) {
      await sql`rollback`.execute(db);
      throw error;
    }
  } finally {
    await sql`pragma foreign_keys = on`.execute(db);
  }
};

/** The unique constraints or indexes on `scopes.name` alone, by name: what 0004's `.unique()` made. */
const nameUniques = async (db: Kysely<unknown>, dialect: DatabaseDialect): Promise<string[]> => {
  if (dialect === "postgres")
    return (
      await sql<{ name: string }>`select con.conname as name
        from pg_constraint con join pg_class rel on rel.oid = con.conrelid
        where rel.relname = 'scopes' and con.contype = 'u'
          and array_length(con.conkey, 1) = 1
          and con.conkey[1] = (select attnum from pg_attribute
            where attrelid = rel.oid and attname = 'name')`.execute(db)
    ).rows.map((row) => row.name);
  return (
    await sql<{ name: string }>`select index_name as name from information_schema.statistics
      where table_schema = database() and table_name = 'scopes' and non_unique = 0
        and index_name <> 'PRIMARY'
      group by index_name
      having count(*) = 1 and max(column_name) = 'name'`.execute(db)
  ).rows.map((row) => row.name);
};

const mysqlHasIndex = async (db: Kysely<unknown>, table: string, name: string) => {
  const result = await sql`select 1 from information_schema.statistics
    where table_schema = database() and table_name = ${table} and index_name = ${name}`.execute(db);
  return result.rows.length > 0;
};

/**
 * PostgreSQL and MySQL drop the unique on `scopes.name` and add one on `(workspace_id, name)`.
 * PostgreSQL runs it in one transaction; MySQL checks each step, so a failed run can be rerun.
 */
const migrateServer = async (db: Kysely<unknown>, dialect: DatabaseDialect) => {
  if (
    dialect === "postgres" ||
    !(await mysqlHasIndex(db, "scopes", "scopes_workspace_name_unique"))
  )
    await db.schema
      .createIndex("scopes_workspace_name_unique")
      .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
      .unique()
      .on("scopes")
      .columns(["workspace_id", "name"])
      .execute();
  for (const name of await nameUniques(db, dialect))
    await (dialect === "postgres"
      ? sql`alter table scopes drop constraint ${sql.id(name)}`
      : sql`alter table scopes drop index ${sql.id(name)}`
    ).execute(db);
  await createAliases(db, dialect);
  if (dialect === "postgres" || !(await mysqlHasIndex(db, "item_aliases", "item_aliases_item_idx")))
    await db.schema
      .createIndex("item_aliases_item_idx")
      .$call((index) => (dialect === "mysql" ? index : index.ifNotExists()))
      .on("item_aliases")
      .column("item_id")
      .execute();
  await writeOldNames(db, dialect);
};

/**
 * The workspace in item names (feature 118): scope names are unique per workspace instead of across
 * the instance, and `item_aliases` keeps the names items had before, starting with the `@scope/name`
 * of every item outside `global`. Nothing else is renamed, and no stored package changes.
 */
export const workspaceInNames: AppMigration = (dialect) => ({
  async up(db: Kysely<unknown>) {
    if (dialect === "sqlite") await migrateSqlite(db, dialect);
    else await migrateServer(db, dialect);
  },
});
