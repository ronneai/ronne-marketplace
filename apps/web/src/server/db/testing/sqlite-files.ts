import SqliteDatabase from "better-sqlite3";

/**
 * Raw SQLite files for tests that need what createDb never makes (099's restore): a file still in
 * rollback-journal mode, and a file another process holds locked.
 */

/** A rollback-journal SQLite file at `filename`, after running `statements`. */
export const writeJournalModeSqlite = (filename: string, statements: string): void => {
  const database = new SqliteDatabase(filename);
  database.exec(statements);
  database.close();
};

/** Holds `filename` exclusively (WAL, exclusive locking mode) until the returned release runs. */
export const holdSqliteExclusively = (filename: string): (() => void) => {
  const database = new SqliteDatabase(filename);
  database.pragma("journal_mode = WAL");
  database.pragma("locking_mode = EXCLUSIVE");
  database.exec("begin immediate; commit");
  return () => database.close();
};

/** Tries one write to `filename` from another connection, without waiting: its error code, or null. */
export const tryWriteSqlite = (filename: string): string | null => {
  const database = new SqliteDatabase(filename, { timeout: 0 });
  try {
    database.exec("create table if not exists intruder (x); drop table intruder");
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? "error";
  } finally {
    database.close();
  }
};
