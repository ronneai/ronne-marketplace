import { type Kysely, sql } from "kysely";
import type { DatabaseDialect } from "./url";

/** Rolls the snapshot back, and puts SQLite's `query_only` back as it was before. */
const end = async <DB>(connection: Kysely<DB>, dialect: DatabaseDialect, queryOnly: boolean) => {
  try {
    await sql`rollback`.execute(connection);
  } finally {
    if (dialect === "sqlite")
      await sql`pragma query_only = ${sql.raw(queryOnly ? "on" : "off")}`.execute(connection);
  }
};

/**
 * Runs `fn` on one connection inside a read-only transaction at a repeatable snapshot (099): every
 * read sees what was committed when the snapshot started, while other connections keep writing.
 * The snapshot is taken here, before `fn` runs, not at its first read:
 * - PostgreSQL: `REPEATABLE READ READ ONLY`, fixed by a first statement;
 * - MySQL and MariaDB: `START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY` at REPEATABLE READ;
 * - SQLite: a read transaction, fixed by a first read, with `query_only` on for its length (SQLite
 *   has no read-only transaction); under WAL, writers from other connections go on, and this one
 *   keeps reading the pages as they were.
 * The transaction is always rolled back: it wrote nothing. `fn` gets a Kysely bound to that one
 * connection, so every query it makes is inside the snapshot.
 */
export const readSnapshot = async <DB, T>(
  db: Kysely<DB>,
  dialect: DatabaseDialect,
  fn: (snapshot: Kysely<DB>) => Promise<T>,
): Promise<T> =>
  db.connection().execute(async (connection) => {
    let result: T;
    // A connection that was already query-only stays so afterwards.
    const queryOnly =
      dialect === "sqlite" &&
      Number(
        (await sql<{ query_only: number }>`pragma query_only`.execute(connection)).rows[0]
          ?.query_only,
      ) === 1;
    try {
      if (dialect === "postgres") {
        await sql`begin isolation level repeatable read read only`.execute(connection);
      } else if (dialect === "mysql") {
        await sql`set transaction isolation level repeatable read`.execute(connection);
        await sql`start transaction with consistent snapshot, read only`.execute(connection);
      } else {
        await sql`pragma query_only = on`.execute(connection);
        await sql`begin`.execute(connection);
      }
      // PostgreSQL and SQLite take the snapshot at the first statement that reads.
      if (dialect !== "mysql") {
        const catalogue = sql.raw(dialect === "sqlite" ? "sqlite_master" : "pg_class");
        await sql`select count(*) as n from ${catalogue}`.execute(connection);
      }
      result = await fn(connection);
    } catch (error) {
      // The error that ended the work matters more than one from rolling back after it.
      await end(connection, dialect, queryOnly).catch(() => undefined);
      throw error;
    }
    await end(connection, dialect, queryOnly);
    return result;
  });
