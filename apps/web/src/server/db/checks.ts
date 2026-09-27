import { type Kysely, sql } from "kysely";
import { columnTypes } from "./column-types";
import { createDb, type Db } from "./create-db";
import type { DatabaseDialect } from "./url";

export type ConnectionFailure =
  | "invalid_url"
  | "unreachable"
  | "auth_failed"
  | "database_missing"
  | "unknown";

export type ConnectionCheck =
  | { ok: true; dialect: DatabaseDialect; serverVersion: string }
  | { ok: false; kind: ConnectionFailure; message: string };

const UNREACHABLE = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ECONNRESET",
]);
// PostgreSQL SQLSTATE codes and MySQL/MariaDB error codes, checked on PostgreSQL 15 and 18,
// MySQL 8.4 and MariaDB 10.11.
const AUTH_FAILED = new Set([
  "28P01",
  "28000",
  "ER_ACCESS_DENIED_ERROR",
  "ER_DBACCESS_DENIED_ERROR",
]);
const DATABASE_MISSING = new Set(["3D000", "ER_BAD_DB_ERROR"]);

/** Sorts a driver error into the categories the installer explains to the user. */
export const classifyConnectionError = (error: unknown): ConnectionFailure => {
  const err = error as {
    name?: string;
    code?: string;
    message?: string;
    errors?: { code?: string }[];
  };
  if (err?.name === "UnsupportedDatabaseUrlError") return "invalid_url";
  // pg reports an AggregateError when a host resolves to several addresses and all of them fail.
  const codes = [err?.code, ...(err?.errors ?? []).map((e) => e.code)].filter(Boolean) as string[];
  if (codes.some((c) => AUTH_FAILED.has(c))) return "auth_failed";
  if (codes.some((c) => DATABASE_MISSING.has(c))) return "database_missing";
  if (codes.some((c) => UNREACHABLE.has(c))) return "unreachable";
  if (codes.some((c) => c === "EACCES" || c === "EPERM" || c.startsWith("SQLITE_CANTOPEN")))
    return "unreachable";
  if (/timeout/i.test(err?.message ?? "")) return "unreachable";
  return "unknown";
};

const serverVersion = async (db: Db, dialect: DatabaseDialect): Promise<string> => {
  if (dialect === "sqlite") {
    const { rows } = await sql<{ v: string }>`select sqlite_version() as v`.execute(db);
    return rows[0]?.v ?? "";
  }
  if (dialect === "postgres") {
    const { rows } = await sql<{ server_version: string }>`show server_version`.execute(db);
    return rows[0]?.server_version ?? "";
  }
  const { rows } = await sql<{ v: string }>`select version() as v`.execute(db);
  return rows[0]?.v ?? "";
};

/**
 * Connects to DATABASE_URL, runs a query, and disconnects. Never throws: failures come back as a
 * category plus the driver's message, for the installer to show (feature 003).
 */
export const checkConnection = async (
  url: string,
  options: { baseDir?: string; connectTimeoutMs?: number } = {},
): Promise<ConnectionCheck> => {
  let created: ReturnType<typeof createDb> | undefined;
  try {
    created = createDb(url, { connectTimeoutMs: 5_000, ...options });
    const version = await serverVersion(created.db, created.dialect);
    return { ok: true, dialect: created.dialect, serverVersion: version };
  } catch (error) {
    return { ok: false, kind: classifyConnectionError(error), message: (error as Error).message };
  } finally {
    await created?.db.destroy().catch(() => {});
  }
};

export type PermissionStep = "create" | "write" | "read" | "drop";

export type PermissionCheck = { ok: true } | { ok: false; step: PermissionStep; message: string };

export const PROBE_TABLE = "_ronne_probe";

/**
 * Proves the database user can do what migrations and the app need: create a table, write to it,
 * read it back and drop it. Leaves nothing behind, even when a step fails.
 */
export const checkPermissions = async (
  db: Db,
  dialect: DatabaseDialect,
): Promise<PermissionCheck> => {
  // biome-ignore lint/suspicious/noExplicitAny: the probe table isn't part of the app's schema.
  const anyDb = db as unknown as Kysely<any>;
  let step: PermissionStep = "create";
  try {
    await anyDb.schema.dropTable(PROBE_TABLE).ifExists().execute();
    await anyDb.schema
      .createTable(PROBE_TABLE)
      .addColumn("id", columnTypes(dialect).id(), (c) => c.primaryKey())
      .execute();
    step = "write";
    await anyDb.insertInto(PROBE_TABLE).values({ id: "01PROBE0000000000000000000" }).execute();
    step = "read";
    const rows = await anyDb.selectFrom(PROBE_TABLE).select("id").execute();
    if (rows.length !== 1)
      throw new Error(`Expected 1 row in ${PROBE_TABLE}, found ${rows.length}`);
    step = "drop";
    await anyDb.schema.dropTable(PROBE_TABLE).execute();
    return { ok: true };
  } catch (error) {
    if (step !== "create" && step !== "drop") {
      await anyDb.schema
        .dropTable(PROBE_TABLE)
        .ifExists()
        .execute()
        .catch(() => {});
    }
    return { ok: false, step, message: (error as Error).message };
  }
};

/** Minimum supported server versions (docs/policies/dependencies.md §2, feature 004). */
export const MINIMUM_VERSIONS = { postgres: [15, 0], mysql: [8, 4], mariadb: [10, 11] } as const;

export type VersionCheck =
  | { supported: true }
  | { supported: false; product: string; minimum: string };

/** Whether a server version string (from checkConnection) is one Ronne supports. SQLite always is. */
export const checkServerVersion = (
  dialect: DatabaseDialect,
  serverVersion: string,
): VersionCheck => {
  if (dialect === "sqlite") return { supported: true };
  const [major = 0, minor = 0] = (serverVersion.match(/\d+/g) ?? []).map(Number);
  const product =
    dialect === "postgres" ? "postgres" : /mariadb/i.test(serverVersion) ? "mariadb" : "mysql";
  const [minMajor, minMinor] = MINIMUM_VERSIONS[product];
  const ok = major > minMajor || (major === minMajor && minor >= minMinor);
  const names = { postgres: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB" } as const;
  return ok
    ? { supported: true }
    : {
        supported: false,
        product: names[product],
        minimum: product === "postgres" ? `${minMajor}` : `${minMajor}.${minMinor}`,
      };
};

/**
 * MySQL and MariaDB databases must use utf8mb4, or some text can't be stored. Other dialects pass.
 * Returns the database's character set when it's wrong.
 */
export const checkCharset = async (
  db: Db,
  dialect: DatabaseDialect,
): Promise<{ ok: true } | { ok: false; charset: string }> => {
  if (dialect !== "mysql") return { ok: true };
  const { rows } = await sql<{
    charset: string;
  }>`select @@character_set_database as charset`.execute(db);
  const charset = rows[0]?.charset ?? "unknown";
  return charset === "utf8mb4" ? { ok: true } : { ok: false, charset };
};
