import { type Kysely, sql } from "kysely";
import { MIGRATION_LOCK_TABLE, MIGRATION_TABLE } from "./migrate";
import type { DatabaseDialect } from "./url";

/**
 * The tables the database really has, read from its own catalogue (099): what a backup dumps and a
 * restore checks against, whatever migrations made them. The migration tables are left out: their
 * state travels as the list of applied migrations.
 */
export type TableColumn = {
  name: string;
  /** The database's own type, lower case: `varchar`, `timestamptz`, `tinyint(1)`, `integer`… */
  type: string;
  nullable: boolean;
};

export type TableSchema = {
  name: string;
  /** In the table's own order. */
  columns: TableColumn[];
  /** The primary key's columns, in the key's order. */
  primaryKey: string[];
  /** The other tables its foreign keys point to, sorted, without itself. */
  references: string[];
};

const SKIPPED = new Set([MIGRATION_TABLE, MIGRATION_LOCK_TABLE]);

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string | number;
};
type KeyRow = { table_name: string; column_name: string };
type ReferenceRow = { table_name: string; referenced: string };

const sqliteSchema = async (db: Kysely<unknown>): Promise<TableSchema[]> => {
  const { rows: tables } = await sql<{ name: string }>`
    select name from sqlite_master
    where type = 'table' and name not like 'sqlite_%'
    order by name`.execute(db);
  const out: TableSchema[] = [];
  for (const { name } of tables) {
    const { rows: columns } = await sql<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>`select name, type, "notnull", pk from pragma_table_info(${name}) order by cid`.execute(db);
    const { rows: keys } = await sql<{ table: string }>`
      select "table" from pragma_foreign_key_list(${name})`.execute(db);
    // SQLite lets a primary key hold NULL unless it's declared NOT NULL; only an INTEGER PRIMARY
    // KEY, the rowid itself, can't.
    const rowid = columns.filter((c) => c.pk > 0).length === 1;
    out.push({
      name,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type.toLowerCase(),
        nullable: c.notnull === 0 && !(rowid && c.pk === 1 && c.type.toLowerCase() === "integer"),
      })),
      primaryKey: columns
        .filter((c) => c.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name),
      references: keys.map((k) => k.table),
    });
  }
  return out;
};

const postgresSchema = async (db: Kysely<unknown>): Promise<TableSchema[]> => {
  const { rows: columns } = await sql<ColumnRow>`
    select c.table_name, c.column_name, c.data_type, c.is_nullable
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = current_schema() and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position`.execute(db);
  const { rows: keys } = await sql<KeyRow>`
    select k.table_name, k.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage k
      on k.constraint_schema = tc.constraint_schema and k.constraint_name = tc.constraint_name
     and k.table_name = tc.table_name
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = current_schema()
    order by k.table_name, k.ordinal_position`.execute(db);
  // pg_constraint, not information_schema: the latter only lists what the user owns.
  const { rows: references } = await sql<ReferenceRow>`
    select src.relname as table_name, dst.relname as referenced
    from pg_constraint c
    join pg_class src on src.oid = c.conrelid
    join pg_class dst on dst.oid = c.confrelid
    where c.contype = 'f' and c.connamespace = current_schema()::regnamespace`.execute(db);
  return assemble(columns, keys, references);
};

const mysqlSchema = async (db: Kysely<unknown>): Promise<TableSchema[]> => {
  // column_type keeps `tinyint(1)`, which is how a boolean looks in MySQL and MariaDB.
  const { rows: columns } = await sql<ColumnRow>`
    select c.table_name as table_name, c.column_name as column_name,
           c.column_type as data_type, c.is_nullable as is_nullable
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = database() and t.table_type = 'BASE TABLE'
    order by c.table_name, c.ordinal_position`.execute(db);
  const { rows: keys } = await sql<KeyRow>`
    select table_name as table_name, column_name as column_name
    from information_schema.key_column_usage
    where table_schema = database() and constraint_name = 'PRIMARY'
    order by table_name, ordinal_position`.execute(db);
  const { rows: references } = await sql<ReferenceRow>`
    select table_name as table_name, referenced_table_name as referenced
    from information_schema.key_column_usage
    where table_schema = database() and referenced_table_name is not null`.execute(db);
  return assemble(columns, keys, references);
};

const assemble = (
  columns: ColumnRow[],
  keys: KeyRow[],
  references: ReferenceRow[],
): TableSchema[] => {
  const tables = new Map<string, TableSchema>();
  for (const c of columns) {
    let table = tables.get(c.table_name);
    if (!table) {
      table = { name: c.table_name, columns: [], primaryKey: [], references: [] };
      tables.set(c.table_name, table);
    }
    table.columns.push({
      name: c.column_name,
      type: c.data_type.toLowerCase(),
      nullable: String(c.is_nullable).toUpperCase() === "YES",
    });
  }
  for (const k of keys) tables.get(k.table_name)?.primaryKey.push(k.column_name);
  for (const r of references) tables.get(r.table_name)?.references.push(r.referenced);
  return [...tables.values()].sort((a, b) => compareNames(a.name, b.name));
};

/** Byte order, the same in every locale, so two databases list their tables alike. */
const compareNames = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The database's tables, without the migration tables, sorted by name. */
export const readSchema = async (
  db: Kysely<unknown>,
  dialect: DatabaseDialect,
): Promise<TableSchema[]> => {
  const all =
    dialect === "sqlite"
      ? await sqliteSchema(db)
      : dialect === "postgres"
        ? await postgresSchema(db)
        : await mysqlSchema(db);
  return all
    .filter((t) => !SKIPPED.has(t.name))
    .map((t) => ({
      ...t,
      references: [...new Set(t.references)].filter((r) => r !== t.name).sort(compareNames),
    }));
};

/**
 * The tables in an order where each comes after the tables its foreign keys point to (ties by
 * name), so rows can be loaded in it. Throws on a cycle, which the migrations don't make.
 */
export const foreignKeyOrder = (tables: readonly TableSchema[]): TableSchema[] => {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const done = new Set<string>();
  const ordered: TableSchema[] = [];
  const visiting = new Set<string>();
  const visit = (table: TableSchema, path: string[]) => {
    if (done.has(table.name)) return;
    if (visiting.has(table.name))
      throw new Error(
        `The tables' foreign keys form a cycle: ${[...path, table.name].join(" → ")}.`,
      );
    visiting.add(table.name);
    for (const name of table.references) {
      const referenced = byName.get(name);
      if (referenced) visit(referenced, [...path, table.name]);
    }
    visiting.delete(table.name);
    done.add(table.name);
    ordered.push(table);
  };
  for (const table of [...tables].sort((a, b) => compareNames(a.name, b.name))) visit(table, []);
  return ordered;
};
