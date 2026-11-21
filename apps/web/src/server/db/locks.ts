import { type Kysely, type SelectQueryBuilder, sql } from "kysely";
import type { DatabaseDialect } from "./url";

/**
 * Locks the selected rows until the transaction ends (`SELECT … FOR UPDATE`), so two transactions
 * that check then write can't both pass the check. SQLite has no FOR UPDATE, and doesn't need it:
 * its write transactions already run one at a time.
 */
export const forUpdate = <DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  dialect: DatabaseDialect,
): SelectQueryBuilder<DB, TB, O> => (dialect === "sqlite" ? query : query.forUpdate());

/**
 * A transaction at READ COMMITTED, where each statement sees what other transactions have
 * committed. It's PostgreSQL's default; MySQL and MariaDB default to REPEATABLE READ, whose
 * snapshot is taken at the first read, so a check made after waiting for a `forUpdate` lock would
 * still miss what the other transaction committed meanwhile. SQLite runs writers one at a time.
 */
export const readCommittedTransaction = <DB>(db: Kysely<DB>, dialect: DatabaseDialect) =>
  dialect === "sqlite" ? db.transaction() : db.transaction().setIsolationLevel("read committed");

/**
 * A transaction that reads rows and then writes them (109's counters): READ COMMITTED with
 * `forUpdate` on PostgreSQL, MySQL and MariaDB, and `BEGIN IMMEDIATE` on SQLite. A deferred SQLite
 * transaction that reads first and writes second fails at once with SQLITE_BUSY when another
 * process (an `rmk-server` command, a second server on the same file) wrote meanwhile: the busy
 * timeout only covers waiting for the lock, never a snapshot gone stale. Taking the write lock at
 * BEGIN makes that process wait out the timeout instead. Within one process, Kysely's SQLite
 * connection already runs one transaction at a time, so `work` uses `trx` only: calling
 * `writeTransaction` or `db.transaction()` on the same SQLite `db` inside it waits for ever.
 */
export const writeTransaction = async <DB, T>(
  db: Kysely<DB>,
  dialect: DatabaseDialect,
  work: (trx: Kysely<DB>) => Promise<T>,
): Promise<T> => {
  if (dialect !== "sqlite") return readCommittedTransaction(db, dialect).execute(work);
  return db.connection().execute(async (conn) => {
    await sql`begin immediate`.execute(conn);
    try {
      const result = await work(conn);
      await sql`commit`.execute(conn);
      return result;
    } catch (error) {
      await sql`rollback`.execute(conn).catch(() => {});
      throw error;
    }
  });
};

/**
 * Whether the database chose this transaction to end a deadlock: PostgreSQL's `40P01`, MySQL's and
 * MariaDB's 1213. Foreign-key checks take shared locks on the parent row, so transactions that lock
 * rows in one order can still meet in a cycle; the database rolls one back, which can simply run
 * again (113).
 */
export const isDeadlock = (error: unknown): boolean => {
  const e = error as { code?: unknown; errno?: unknown } | null;
  return e?.code === "40P01" || e?.errno === 1213 || e?.code === "ER_LOCK_DEADLOCK";
};

/** How many times a transaction the database rolled back to end a deadlock is run in all. */
export const DEADLOCK_ATTEMPTS = 3;

/**
 * Runs a transaction again when the database rolled it back to end a deadlock (113), up to
 * DEADLOCK_ATTEMPTS times in all. Only for work that does nothing outside the database: the
 * rolled-back attempt left nothing behind.
 */
export const retryOnDeadlock = async <T>(run: () => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (!isDeadlock(error) || attempt >= DEADLOCK_ATTEMPTS) throw error;
    }
  }
};

/**
 * Whether the database refused a write because it would break a unique index: PostgreSQL's
 * `23505`, MySQL's and MariaDB's 1062, SQLite's `SQLITE_CONSTRAINT_UNIQUE` (or `_PRIMARYKEY`).
 * A library may wrap the driver's error, so its `cause` is checked too.
 */
export const isUniqueViolation = (error: unknown, depth = 0): boolean => {
  const e = error as { code?: unknown; errno?: unknown; cause?: unknown } | null;
  if (!e || depth >= 4) return false;
  return (
    e.code === "23505" ||
    e.errno === 1062 ||
    e.code === "ER_DUP_ENTRY" ||
    e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    e.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    isUniqueViolation(e.cause, depth + 1)
  );
};
