import { type Kysely, sql } from "kysely";
import { MIGRATION_LOCK_TABLE } from "./migrate";
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
 *
 * With `waitForMigrations`, the snapshot starts while holding the migration lock (the one Kysely's
 * migrator takes: an advisory lock on PostgreSQL, `GET_LOCK` on MySQL and MariaDB), which is
 * released once the snapshot is fixed: a migration running elsewhere ends first, so the snapshot
 * never sees half of one (MySQL's DDL isn't transactional). SQLite's migrations run in one
 * transaction, which a read transaction never sees half of.
 */
export const readSnapshot = async <DB, T>(
  db: Kysely<DB>,
  dialect: DatabaseDialect,
  fn: (snapshot: Kysely<DB>) => Promise<T>,
  options: { waitForMigrations?: boolean } = {},
): Promise<T> =>
  db.connection().execute(async (connection) => {
    let result: T;
    const lock = options.waitForMigrations && dialect !== "sqlite";
    const lockOptions = {
      lockTable: MIGRATION_LOCK_TABLE,
      lockRowId: "migration_lock",
    };
    const adapter = connection.getExecutor().adapter;
    let locked = false;
    const unlock = async () => {
      if (!locked) return;
      locked = false;
      await adapter.releaseMigrationLock(connection, lockOptions);
    };
    // A connection that was already query-only stays so afterwards.
    const queryOnly =
      dialect === "sqlite" &&
      Number(
        (await sql<{ query_only: number }>`pragma query_only`.execute(connection)).rows[0]
          ?.query_only,
      ) === 1;
    try {
      if (lock) {
        await adapter.acquireMigrationLock(connection, lockOptions);
        locked = true;
      }
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
      // The snapshot is fixed: a migration may start now without this one seeing it.
      await unlock();
      result = await fn(connection);
    } catch (error) {
      // The error that ended the work matters more than one from rolling back after it.
      await end(connection, dialect, queryOnly).catch(() => undefined);
      await unlock().catch(() => undefined);
      throw error;
    }
    await end(connection, dialect, queryOnly);
    return result;
  });
