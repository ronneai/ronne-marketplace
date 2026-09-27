import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import SqliteDatabase from "better-sqlite3";
import { CompiledQuery, Kysely, MysqlDialect, PostgresDialect, SqliteDialect } from "kysely";
import { createPool } from "mysql2";
import pg from "pg";
import type { Database } from "./schema";
import { type DatabaseDialect, parseDatabaseUrl } from "./url";

export type Db = Kysely<Database>;

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
      });
      const dialect = new MysqlDialect({
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
