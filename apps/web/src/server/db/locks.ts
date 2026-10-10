import type { Kysely, SelectQueryBuilder } from "kysely";
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
