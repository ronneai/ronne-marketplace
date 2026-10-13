import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "./create-db";
import { createTestDb } from "./testing/test-db";

describe("createDb with SQLite", () => {
  const cleanups: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  it("connects to an in-memory database", async () => {
    const { db, dialect } = createDb("file::memory:");
    cleanups.push(() => db.destroy());

    expect(dialect).toBe("sqlite");
    const { rows } = await sql<{ one: number }>`select 1 as one`.execute(db);
    expect(rows).toEqual([{ one: 1 }]);
  });

  it("creates the folder for a file database and turns on foreign keys and WAL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ronne-db-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const { db } = createDb("file:./nested/folder/ronne.db", { baseDir: dir });
    cleanups.unshift(() => db.destroy());

    const fk = await sql<{ foreign_keys: number }>`pragma foreign_keys`.execute(db);
    const wal = await sql<{ journal_mode: string }>`pragma journal_mode`.execute(db);
    expect(fk.rows[0]?.foreign_keys).toBe(1);
    expect(wal.rows[0]?.journal_mode).toBe("wal");
  });
});

describe("createDb with MySQL and MariaDB (099)", () => {
  const url = process.env.TEST_DATABASE_URL ?? "";
  it.skipIf(!url.startsWith("mysql"))(
    "reads DATETIME as UTC with the year exactly as stored, years 0-99 included",
    async () => {
      const { db } = createDb(url);
      try {
        await sql`create temporary table dates (id int primary key, at datetime(3) null)`.execute(
          db,
        );
        const stored = [
          "0001-01-01 00:00:00.000",
          "0050-06-15 12:00:00.000",
          "0099-12-31 23:59:59.999",
          "1900-02-28 00:00:00.000",
          "2000-02-29 12:34:56.789",
          "2038-01-19 03:14:08.000",
          "9999-12-31 23:59:59.999",
        ];
        for (const [i, at] of stored.entries())
          await sql`insert into dates values (${i}, ${sql.lit(at)})`.execute(db);
        await sql`insert into dates values (99, null)`.execute(db);
        // Zero and out-of-range parts, which MariaDB (and MySQL without NO_ZERO_IN_DATE) store:
        // invalid, never rolled over to another date.
        await sql`set session sql_mode = ''`.execute(db);
        await sql`insert into dates values (100, '0000-00-00 00:00:00'), (101, '2026-00-15 10:00:00')`.execute(
          db,
        );
        const { rows: odd } = await sql<{ at: Date }>`
          select at from dates where id >= 100 order by id`.execute(db);
        expect(odd.map((r) => Number.isNaN(r.at.getTime()))).toEqual([true, true]);
        const { rows } = await sql<{ id: number; at: Date | null }>`
          select id, at from dates where id < 100 order by id`.execute(db);
        expect(rows.map((r) => (r.at instanceof Date ? r.at.toISOString() : r.at))).toEqual([
          ...stored.map((at) => `${at.replace(" ", "T")}Z`),
          null,
        ]);
      } finally {
        await db.destroy();
      }
    },
  );
});

describe("the migration lock on MySQL and MariaDB (099)", () => {
  const url = process.env.TEST_DATABASE_URL ?? "";
  it.skipIf(!url.startsWith("mysql"))(
    "belongs to one database: another database's is free while this one's is held",
    async () => {
      const first = await createTestDb({ fresh: true });
      const second = await createTestDb({ fresh: true });
      try {
        const options = { lockTable: "ronne_migration_lock", lockRowId: "migration_lock" };
        await first.db.connection().execute(async (holder) => {
          const adapter = holder.getExecutor().adapter;
          await adapter.acquireMigrationLock(holder as never, options);
          try {
            // Another database: taken at once.
            await second.db.connection().execute(async (other) => {
              const started = Date.now();
              await other.getExecutor().adapter.acquireMigrationLock(other as never, options);
              expect(Date.now() - started).toBeLessThan(2000);
              await other.getExecutor().adapter.releaseMigrationLock(other as never, options);
            });
            // This database: held, as another connection sees.
            const { rows } = await sql<{ held: number | null }>`
              select is_used_lock(concat('ronne-migration:', sha1(lower(database())))) as held`.execute(
              first.db,
            );
            expect(rows[0]?.held).not.toBeNull();
          } finally {
            await adapter.releaseMigrationLock(holder as never, options);
          }
        });
      } finally {
        await second.cleanup();
        await first.cleanup();
      }
    },
  );

  it.skipIf(!url.startsWith("mysql"))(
    "throws when the lock isn't taken, never going on without it",
    async () => {
      const t = await createTestDb({ fresh: true });
      try {
        const options = { lockTable: "ronne_migration_lock", lockRowId: "migration_lock" };
        await t.db.connection().execute(async (holder) => {
          const adapter = holder.getExecutor().adapter;
          await adapter.acquireMigrationLock(holder as never, options);
          try {
            await t.db.connection().execute(async (waiter) => {
              const { rows } = await sql<{ id: number }>`select connection_id() as id`.execute(
                waiter,
              );
              const waiting = waiter
                .getExecutor()
                .adapter.acquireMigrationLock(waiter as never, options)
                .then(
                  () => "taken",
                  (error: Error) => error.message,
                );
              await new Promise((resolve) => setTimeout(resolve, 300));
              // The wait stopped from outside: MariaDB's GET_LOCK then answers NULL, MySQL errors.
              await sql`kill query ${sql.lit(Number(rows[0]?.id))}`.execute(holder);
              expect(await waiting).toMatch(/migration lock couldn't be taken|interrupted/);
            });
          } finally {
            await adapter.releaseMigrationLock(holder as never, options);
          }
        });
      } finally {
        await t.cleanup();
      }
    },
  );
});
