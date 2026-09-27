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
