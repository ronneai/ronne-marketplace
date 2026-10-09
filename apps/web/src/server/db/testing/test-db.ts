import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { decodeTime } from "ulid";
import { createDb, type Db } from "../create-db";
import { newId } from "../ids";
import { MIGRATION_LOCK_TABLE, MIGRATION_TABLE, migrateToLatest } from "../migrate";
import { type DatabaseDialect, parseDatabaseUrl } from "../url";

export type TestDb = {
  db: Db;
  dialect: DatabaseDialect;
  /** The database's URL, for code under test that opens its own connection. */
  url: string;
  cleanup: () => Promise<void>;
};

/** Migrations' own bookkeeping: never emptied. */
const KEPT = new Set([MIGRATION_TABLE, MIGRATION_LOCK_TABLE]);

/** Leftover test databases older than this are dropped when a run starts (interrupted runs). */
const STALE_MS = 2 * 60 * 60 * 1000;

/**
 * One migrated database per test file on a server (112): migrating a new database for every test
 * made MySQL's run three times PostgreSQL's (DDL is slow there). Each `createTestDb()` after the
 * first puts it back to just migrated: tables emptied, the rows the migrations inserted (such as
 * the `global` workspace) put back, and, if a test changed the schema, dropped and migrated again.
 * Each test gets a new connection pool, closed by its `cleanup()`, so nothing a test sets on a
 * connection reaches the next. `dropSharedTestDb()` drops it after the file (`db-setup.ts`).
 *
 * A test must end every transaction it starts: one left open holds its connection and locks, so
 * the next test gets a newly migrated database, and that one is left to the next run (a warning
 * names it).
 *
 * Two calls in one test file without `fresh: true` give the same database: the second empties it
 * and closes the first one's pool (a handle from `beforeAll` too). A test that needs two at once,
 * or one for the whole file, asks for `fresh: true`. A transaction a test leaves open for
 * ever still blocks the next reset, as it blocked the old drop: a bug in that test.
 */
type Shared = {
  name: string;
  url: string;
  dialect: DatabaseDialect;
  admin: Db;
  schema: string;
  tables: string[];
  baseline: { table: string; rows: Record<string, unknown>[] }[];
  /** The pools handed to tests and not closed yet: closed before the next reset and the drop. */
  pools: Set<Db>;
  /** A pool didn't close: a test left a transaction open, which holds its connection (and locks). */
  stuck?: boolean;
};

/** How long a pool gets to close before it counts as held by a transaction nobody ended. */
const CLOSE_MS = 2_000;

/** Closes a pool; false when it doesn't close in time, and it's left to itself. */
const closed = (pool: Db) =>
  Promise.race([
    pool.destroy().then(
      () => true,
      () => true,
    ),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), CLOSE_MS).unref()),
  ]);
let shared: Shared | null = null;

/** Closes the pools tests left open on the shared database, the app's cached one included. */
const closePools = async (state: Shared) => {
  for (const pool of [...state.pools]) {
    state.pools.delete(pool);
    if (!(await closed(pool))) state.stuck = true;
  }
  // `getAppDb(url)` keeps one pool per URL on globalThis (db/instance.ts): code under test reaches
  // the shared database through it too, so it goes as well, and opens anew when next used.
  const cached = (globalThis as { __ronneDbPools?: Map<string, { db: Db }> }).__ronneDbPools;
  const app = cached?.get(state.url);
  if (app) {
    cached?.delete(state.url);
    if (!(await closed(app.db))) state.stuck = true;
  }
};

/** A new, empty database on the server of `baseUrl`; `admin` (a pool on the server) drops it. */
const serverDb = async (baseUrl: string, dialect: DatabaseDialect) => {
  const name = `ronne_test_${newId().toLowerCase()}`;
  const admin = createDb(baseUrl).db;
  await sql`create database ${sql.id(name)}`.execute(admin);
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return { name, url: url.toString(), dialect, admin };
};

/** The rows of a query as sorted JSON: a part of the schema's fingerprint. */
const rowsOf = async (db: Db, query: ReturnType<typeof sql>) =>
  ((await query.execute(db)).rows as Record<string, unknown>[])
    .map((row) => JSON.stringify(row))
    .sort();

/**
 * What a test mustn't have changed: every table and view with its columns, and the indexes,
 * constraints (foreign keys included) and triggers, and the database's own settings.
 */
const schemaOf = async (db: Db, dialect: DatabaseDialect) => {
  const tables = (await db.introspection.getTables())
    .map((t) => ({
      name: t.name,
      view: t.isView,
      columns: t.columns.map((c) => `${c.name}:${c.dataType}:${c.isNullable}`).sort(),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  const extra =
    dialect === "postgres"
      ? {
          indexes: await rowsOf(
            db,
            sql`select indexname, indexdef from pg_indexes where schemaname = 'public'`,
          ),
          constraints: await rowsOf(
            db,
            sql`select conname, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace`,
          ),
          triggers: await rowsOf(db, sql`select tgname from pg_trigger where not tgisinternal`),
          settings: await rowsOf(
            db,
            sql`select setconfig from pg_db_role_setting where setdatabase = (select oid from pg_database where datname = current_database())`,
          ),
        }
      : {
          indexes: await rowsOf(
            db,
            sql`select table_name, index_name, column_name, non_unique from information_schema.statistics where table_schema = database()`,
          ),
          constraints: await rowsOf(
            db,
            sql`select table_name, constraint_name, constraint_type from information_schema.table_constraints where table_schema = database()`,
          ),
          triggers: await rowsOf(
            db,
            sql`select trigger_name from information_schema.triggers where trigger_schema = database()`,
          ),
          settings: await rowsOf(
            db,
            sql`select default_character_set_name, default_collation_name from information_schema.schemata where schema_name = database()`,
          ),
        };
  return JSON.stringify({ tables, ...extra });
};

/** Migrated, with the rows the migrations left: what each test starts from. */
const prepare = async (baseUrl: string, dialect: DatabaseDialect): Promise<Shared> => {
  const created = await serverDb(baseUrl, dialect);
  const { db } = createDb(created.url);
  try {
    await migrateToLatest(db, dialect);
    const tables = (await db.introspection.getTables())
      .filter((t) => !t.isView && !KEPT.has(t.name))
      .map((t) => t.name);
    const baseline: Shared["baseline"] = [];
    for (const table of tables) {
      const rows = (await db
        .selectFrom(table as never)
        .selectAll()
        .execute()) as Record<string, unknown>[];
      if (rows.length > 0) baseline.push({ table, rows });
    }
    return { ...created, schema: await schemaOf(db, dialect), tables, baseline, pools: new Set() };
  } finally {
    await db.destroy();
  }
};

/**
 * Drops a leftover test database, even if something still holds a connection to it (PostgreSQL
 * refuses that otherwise; `with (force)` is in every supported version, 13 and later).
 */
const dropDatabase = (admin: Db, dialect: DatabaseDialect, name: string) =>
  dialect === "postgres"
    ? sql`drop database if exists ${sql.id(name)} with (force)`.execute(admin)
    : sql`drop database if exists ${sql.id(name)}`.execute(admin);

/**
 * Drops a shared database, after the pools tests left open on it, then its server pool; forced,
 * so a connection something else still holds (a transaction a test never ended) can't keep it.
 */
const drop = async (state: Shared) => {
  await closePools(state);
  if (state.stuck) {
    // Forcing it would end that connection under its pool, an error nothing here can catch: it's
    // left, and the next run's global setup drops it (dropStaleTestDbs).
    // Straight to stderr: Vitest hides a passing file's console output.
    process.stderr.write(
      `${state.name}: a test left a transaction open on it (await every transaction), so it's left for the next run to drop.\n`,
    );
    await state.admin.destroy();
    return;
  }
  try {
    // Plain first: PostgreSQL waits a few seconds for the connections just closed to go, where
    // forcing would end them under their pool and raise errors nothing catches.
    await sql`drop database if exists ${sql.id(state.name)}`.execute(state.admin);
  } catch (error) {
    // 55006: still in use by a connection nobody closed.
    if ((error as { code?: string }).code !== "55006") throw error;
    await dropDatabase(state.admin, state.dialect, state.name);
  }
  await state.admin.destroy();
};

/**
 * Back to just migrated, on a pool of its own that's closed after: every table emptied, the
 * migrations' rows put back. False when a test changed the schema: then it's migrated afresh.
 */
const reset = async (state: Shared): Promise<boolean> => {
  await closePools(state);
  // Its locks would hold the reset up: the next test gets a database of its own instead.
  if (state.stuck) return false;
  const { db } = createDb(state.url);
  try {
    if ((await schemaOf(db, state.dialect)) !== state.schema) return false;
    await db.connection().execute(async (connection) => {
      if (state.dialect === "postgres") {
        // Foreign keys aren't checked while the rows go back in (the test user is a superuser).
        await sql`set session_replication_role = replica`.execute(connection);
        await sql`truncate table ${sql.join(state.tables.map((t) => sql.id(t)))} cascade`.execute(
          connection,
        );
      } else {
        await sql`set foreign_key_checks = 0`.execute(connection);
        for (const table of state.tables)
          await sql`delete from ${sql.id(table)}`.execute(connection);
      }
      for (const { table, rows } of state.baseline)
        await connection
          .insertInto(table as never)
          .values(rows as never)
          .execute();
    });
    return true;
  } finally {
    // The connection that turned checks off goes with the pool.
    await db.destroy();
  }
};

/** Drops this file's shared database, if one was made: after the file (`db-setup.ts`). */
export const dropSharedTestDb = async () => {
  const done = shared;
  shared = null;
  if (done) await drop(done);
};

/**
 * Drops test databases left by runs that were interrupted (older than two hours, by the time in
 * their id), so they don't pile up on a server; the db project's global setup runs it.
 */
export const dropStaleTestDbs = async (baseUrl = process.env.TEST_DATABASE_URL ?? "") => {
  if (!baseUrl || parseDatabaseUrl(baseUrl).dialect === "sqlite") return;
  const { dialect } = parseDatabaseUrl(baseUrl);
  const admin = createDb(baseUrl).db;
  try {
    const names =
      dialect === "postgres"
        ? (
            await sql<{
              name: string;
            }>`select datname as name from pg_database where datname like 'ronne_test_%'`.execute(
              admin,
            )
          ).rows.map((r) => r.name)
        : (
            await sql<{
              name: string;
            }>`select schema_name as name from information_schema.schemata where schema_name like 'ronne_test_%'`.execute(
              admin,
            )
          ).rows.map((r) => r.name);
    for (const name of names) {
      let made: number;
      try {
        made = decodeTime(name.slice("ronne_test_".length).toUpperCase());
      } catch {
        continue;
      }
      if (Date.now() - made > STALE_MS) await dropDatabase(admin, dialect, name);
    }
  } finally {
    await admin.destroy();
  }
};

/**
 * A database for one test. Reads TEST_DATABASE_URL:
 * - unset: in-memory SQLite, new each time;
 * - `file:…`: a new SQLite file in a temp folder;
 * - MySQL or PostgreSQL: the file's shared database, migrated once and back to just migrated for
 *   each test; with `{ migrate: false }` or `{ fresh: true }`, a new database `ronne_test_<id>`
 *   of its own, dropped by `cleanup()`, so a test can hold two at once.
 */
export const createTestDb = async (
  options: { migrate?: boolean; fresh?: boolean } = {},
): Promise<TestDb> => {
  const baseUrl = process.env.TEST_DATABASE_URL || "file::memory:";
  const { dialect } = parseDatabaseUrl(baseUrl);
  const migrate = options.migrate ?? true;

  if (dialect !== "sqlite" && migrate && !options.fresh) {
    if (shared && !(await reset(shared))) await dropSharedTestDb();
    shared ??= await prepare(baseUrl, dialect);
    // A pool of its own for this test; the database stays for the next one.
    const { db } = createDb(shared.url);
    const pools = shared.pools;
    pools.add(db);
    return {
      db,
      dialect,
      url: shared.url,
      cleanup: async () => {
        if (pools.delete(db)) await db.destroy();
      },
    };
  }

  let created: TestDb;
  if (dialect === "sqlite") {
    if (baseUrl === "file::memory:") {
      const { db } = createDb(baseUrl);
      created = { db, dialect, url: baseUrl, cleanup: () => db.destroy() };
    } else {
      const dir = mkdtempSync(join(tmpdir(), "ronne-test-"));
      const fileUrl = `file:${join(dir, "test.db")}`;
      const { db } = createDb(fileUrl);
      created = {
        db,
        dialect,
        url: fileUrl,
        cleanup: async () => {
          await db.destroy();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    }
  } else {
    const fresh = await serverDb(baseUrl, dialect);
    const { db } = createDb(fresh.url);
    created = {
      db,
      dialect,
      url: fresh.url,
      cleanup: async () => {
        await db.destroy();
        await sql`drop database if exists ${sql.id(fresh.name)}`.execute(fresh.admin);
        await fresh.admin.destroy();
      },
    };
  }

  if (migrate) await migrateToLatest(created.db, dialect);
  return created;
};
