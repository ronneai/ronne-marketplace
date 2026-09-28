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
