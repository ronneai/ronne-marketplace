import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { createDb, type Db } from "../create-db";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { type DatabaseDialect, parseDatabaseUrl } from "../url";

export type TestDb = { db: Db; dialect: DatabaseDialect; cleanup: () => Promise<void> };

/**
 * A fresh database for one test file. Reads TEST_DATABASE_URL:
 * - unset: in-memory SQLite;
 * - `file:…`: a new SQLite file in a temp folder;
 * - MySQL or PostgreSQL: a new database `ronne_test_<id>` created with that URL's credentials and
 *   dropped by `cleanup()`, so test files can run in parallel against one server.
 * Migrated to the latest version unless `{ migrate: false }`.
 */
export async function createTestDb(options: { migrate?: boolean } = {}): Promise<TestDb> {
  const baseUrl = process.env.TEST_DATABASE_URL || "file::memory:";
  const { dialect } = parseDatabaseUrl(baseUrl);

  let created: TestDb;
  if (dialect === "sqlite") {
    if (baseUrl === "file::memory:") {
      const { db } = createDb(baseUrl);
      created = { db, dialect, cleanup: () => db.destroy() };
    } else {
      const dir = mkdtempSync(join(tmpdir(), "ronne-test-"));
      const { db } = createDb(`file:${join(dir, "test.db")}`);
      created = {
        db,
        dialect,
        cleanup: async () => {
          await db.destroy();
          rmSync(dir, { recursive: true, force: true });
        },
      };
    }
  } else {
    const name = `ronne_test_${newId().toLowerCase()}`;
    const admin = createDb(baseUrl).db;
    await sql`create database ${sql.id(name)}`.execute(admin);

    const url = new URL(baseUrl);
    url.pathname = `/${name}`;
    const { db } = createDb(url.toString());
    created = {
      db,
      dialect,
      cleanup: async () => {
        await db.destroy();
        await sql`drop database if exists ${sql.id(name)}`.execute(admin);
        await admin.destroy();
      },
    };
  }

  if (options.migrate ?? true) await migrateToLatest(created.db, dialect);
  return created;
}
