import { type Kysely, sql } from "kysely";
import type { DatabaseDialect } from "./url";

/**
 * Inserts a row, or updates `updateColumns` when it conflicts on `conflictColumns`.
 * SQLite and PostgreSQL use ON CONFLICT … DO UPDATE; MySQL and MariaDB use ON DUPLICATE KEY UPDATE
 * with VALUES(), which both support (MySQL's newer `AS alias` syntax doesn't work on MariaDB).
 */
export const upsert = <DB, Table extends keyof DB & string>(
  db: Kysely<DB>,
  dialect: DatabaseDialect,
  table: Table,
  values: Record<string, unknown>,
  conflictColumns: readonly string[],
  updateColumns: readonly string[],
) => {
  if (updateColumns.length === 0) throw new Error("upsert needs at least one column to update");

  // Kysely can't check dynamic column names against DB, so the builder is typed loosely here and
  // callers pass the columns of `table`. The table name goes in as a plain string: with the generic
  // `Table`, Kysely derives the allowed update columns and rejects the dynamic objects below.
  // The signature above still checks that `table` is a real table.
  // biome-ignore lint/suspicious/noExplicitAny: see above.
  const insert = (db as Kysely<any>).insertInto(table as string).values(values);

  if (dialect === "mysql") {
    return insert.onDuplicateKeyUpdate(
      Object.fromEntries(updateColumns.map((c) => [c, sql`values(${sql.ref(c)})`])),
    );
  }
  return insert.onConflict((oc) =>
    oc
      .columns([...conflictColumns])
      .doUpdateSet(Object.fromEntries(updateColumns.map((c) => [c, sql.ref(`excluded.${c}`)]))),
  );
};

/**
 * Inserts a row, or adds its `addColumns` to the existing row's when it conflicts on
 * `conflictColumns`: a counter that several writers increase at once (usage totals, 046). The sum
 * happens in the database, so concurrent reports never lose a count.
 */
export const upsertAdding = <DB, Table extends keyof DB & string>(
  db: Kysely<DB>,
  dialect: DatabaseDialect,
  table: Table,
  values: Record<string, unknown>,
  conflictColumns: readonly string[],
  addColumns: readonly string[],
) => {
  if (addColumns.length === 0) throw new Error("upsertAdding needs at least one column to add");
  // Typed loosely for the same reason as upsert above.
  // biome-ignore lint/suspicious/noExplicitAny: see upsert.
  const insert = (db as Kysely<any>).insertInto(table as string).values(values);
  if (dialect === "mysql")
    return insert.onDuplicateKeyUpdate(
      Object.fromEntries(addColumns.map((c) => [c, sql`${sql.ref(c)} + values(${sql.ref(c)})`])),
    );
  return insert.onConflict((oc) =>
    oc
      .columns([...conflictColumns])
      .doUpdateSet(
        Object.fromEntries(
          addColumns.map((c) => [
            c,
            sql`${sql.ref(`${table}.${c}`)} + ${sql.ref(`excluded.${c}`)}`,
          ]),
        ),
      ),
  );
};
