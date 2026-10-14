import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SqliteDatabase from "better-sqlite3";
import {
  CompiledQuery,
  Kysely,
  MysqlAdapter,
  MysqlDialect,
  PostgresDialect,
  SqliteDialect,
  sql,
} from "kysely";
import { createPool } from "mysql2";
import pg from "pg";
import type { Database } from "./schema";
import { type DatabaseDialect, parseDatabaseUrl } from "./url";

export type Db = Kysely<Database>;

/**
 * The migration lock, per database (099). Kysely's MySQL lock is one name for the whole server,
 * so one instance's restore, or a long migration, held every other instance's on that server.
 * PostgreSQL's advisory locks already belong to one database. The name is a hash, since MySQL
 * names stop at 64 characters, of the name in lower case (hosts that ignore case could reach one
 * database by two spellings); server starts, backups and restores of one database share it.
 */
const lockName = sql`concat('ronne-migration:', sha1(lower(database())))`;
class DatabaseMysqlAdapter extends MysqlAdapter {
  override async acquireMigrationLock(db: Kysely<unknown>): Promise<void> {
    // 1: taken. 0 (an hour's wait) or NULL: not taken, and going on would be going on unlocked.
    const { rows } = await sql<{ taken: number | null }>`
      select get_lock(${lockName}, 3600) as taken`.execute(db);
    if (Number(rows[0]?.taken) !== 1)
      throw new Error(
        "The migration lock couldn't be taken: another migration, backup or restore held it (an hour's wait), or the wait was stopped.",
      );
  }
  override async releaseMigrationLock(db: Kysely<unknown>): Promise<void> {
    await sql`select release_lock(${lockName})`.execute(db);
  }
}
class RonneMysqlDialect extends MysqlDialect {
  override createAdapter() {
    return new DatabaseMysqlAdapter();
  }
}

const DATETIME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?$/;

/**
 * mysql2's DATETIME, read as UTC with the year exactly as stored: mysql2 builds it with Date's own
 * rules, which take years 0-99 as 1900-1999, so a backup's dump moved them a century (099).
 */
const readDatetime = (
  field: { type: string; string: () => string | null },
  next: () => unknown,
): unknown => {
  if (field.type !== "DATETIME") return next();
  const text = field.string();
  const match = text === null ? null : DATETIME.exec(text);
  if (!match) return text === null ? null : new Date(Number.NaN);
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number) as number[];
  const ms = Math.floor(Number(`0.${match[7] ?? "0"}`) * 1000);
  const date = new Date(0);
  // Year, month and day together: set apart, February 29 would roll over in another year.
  date.setUTCFullYear(year as number, (month as number) - 1, day);
  date.setUTCHours(hour as number, minute, second, ms);
  // A zero or out-of-range part (MariaDB stores `2026-00-15` by default) would roll over to
  // another real date: it stays invalid, as mysql2's own reading left it, and the dump refuses it.
  const same =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === (month as number) - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second;
  return same ? date : new Date(Number.NaN);
};

export type CreatedDb = { db: Db; dialect: DatabaseDialect };

/**
 * Creates the Kysely instance for DATABASE_URL. The only place that knows which driver is in use.
 * Every connection works in UTC, and SQLite gets WAL, foreign keys and a busy timeout.
 */
export const createDb = (
  url: string,
  options: { baseDir?: string; connectTimeoutMs?: number } = {},
): CreatedDb => {
  // pg has no connect timeout by default, so an unreachable host would hang.
  const connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
  const config = parseDatabaseUrl(url, options.baseDir);

  switch (config.dialect) {
    case "sqlite": {
      if (config.filename !== ":memory:") mkdirSync(dirname(config.filename), { recursive: true });
      const database = new SqliteDatabase(config.filename);
      database.pragma("journal_mode = WAL");
      database.pragma("foreign_keys = ON");
      database.pragma("busy_timeout = 5000");
      return {
        db: new Kysely<Database>({ dialect: new SqliteDialect({ database }) }),
        dialect: "sqlite",
      };
    }
    case "mysql": {
      // Keep mysql2's default FOUND_ROWS flag: Better Auth relies on "rows matched" counts.
      const pool = createPool({
        uri: config.uri,
        timezone: "Z",
        charset: "utf8mb4",
        connectTimeout: connectTimeoutMs,
        typeCast: readDatetime,
      });
      const dialect = new RonneMysqlDialect({
        pool,
        onCreateConnection: async (connection) => {
          await connection.executeQuery(CompiledQuery.raw("SET time_zone = '+00:00'"));
        },
      });
      return { db: new Kysely<Database>({ dialect }), dialect: "mysql" };
    }
    case "postgres": {
      const pool = new pg.Pool({
        connectionString: config.connectionString,
        connectionTimeoutMillis: connectTimeoutMs,
      });
      const dialect = new PostgresDialect({
        pool,
        onCreateConnection: async (connection) => {
          await connection.executeQuery(CompiledQuery.raw("SET TIME ZONE 'UTC'"));
        },
      });
      return { db: new Kysely<Database>({ dialect }), dialect: "postgres" };
    }
  }
};

/**
 * A SQLite file opened read-only, changing nothing in it (createDb turns WAL on): for a look that
 * mustn't write, such as restore's emptiness check before it decides to use the file (099).
 */
export const openSqliteReadOnly = (filename: string): Kysely<unknown> => {
  const database = new SqliteDatabase(filename, { readonly: true, fileMustExist: true });
  return new Kysely<unknown>({ dialect: new SqliteDialect({ database }) });
};
