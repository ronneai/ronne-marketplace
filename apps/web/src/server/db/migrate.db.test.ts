import { type Kysely, sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { columnTypes } from "./column-types";
import {
  DatabaseAheadOfAppError,
  MIGRATION_TABLE,
  MigrationFailedError,
  migrateToLatest,
} from "./migrate";
import type { AppMigration } from "./migrations/types";
import { createTestDb, type TestDb } from "./testing/test-db";

const createTable =
  (table: string): AppMigration =>
  (dialect) => ({
    up: async (db: Kysely<unknown>) => {
      await db.schema
        .createTable(table)
        .addColumn("id", columnTypes(dialect).id(), (c) => c.primaryKey())
        .execute();
    },
  });

const failing: AppMigration = () => ({
  up: async (db: Kysely<unknown>) => {
    await sql`this is not sql`.execute(db);
  },
});

// Kysely only hides its default migration tables, so ours are filtered out here.
const tableNames = async <DB>(db: Kysely<DB>) =>
  (await db.introspection.getTables())
    .map((t) => t.name)
    .filter((name) => !name.startsWith(MIGRATION_TABLE))
    .sort();

describe("migrateToLatest", () => {
  const opened: TestDb[] = [];
  const freshDb = async () => {
    const created = await createTestDb({ migrate: false });
    opened.push(created);
    return created;
  };
  afterEach(async () => {
    for (const t of opened.splice(0)) await t.cleanup();
  });

  it("applies pending migrations in order, then has nothing left to do", async () => {
    const { db, dialect } = await freshDb();
    const list = { "0001_first": createTable("first"), "0002_second": createTable("second") };

    expect(await migrateToLatest(db, dialect, list)).toEqual(["0001_first", "0002_second"]);
    expect(await migrateToLatest(db, dialect, list)).toEqual([]);
    expect(await tableNames(db)).toEqual(["first", "second"]);
  });

  it("applies only the new migration when one is added later", async () => {
    const { db, dialect } = await freshDb();
    await migrateToLatest(db, dialect, { "0001_first": createTable("first") });

    const applied = await migrateToLatest(db, dialect, {
      "0001_first": createTable("first"),
      "0002_second": createTable("second"),
    });
    expect(applied).toEqual(["0002_second"]);
  });

  it("refuses a database migrated by a newer version", async () => {
    const { db, dialect } = await freshDb();
    await migrateToLatest(db, dialect, {
      "0001_first": createTable("first"),
      "0002_second": createTable("second"),
    });

    const older = { "0001_first": createTable("first") };
    await expect(migrateToLatest(db, dialect, older)).rejects.toThrowError(DatabaseAheadOfAppError);
    await expect(migrateToLatest(db, dialect, older)).rejects.toThrowError(/0002_second/);
  });

  it("stops at a failing migration and reports which one", async () => {
    const { db, dialect } = await freshDb();
    const list = {
      "0001_first": createTable("first"),
      "0002_broken": failing,
      "0003_third": createTable("third"),
    };

    const error = await migrateToLatest(db, dialect, list).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MigrationFailedError);
    expect(error).toMatchObject({ migration: "0002_broken", applied: ["0001_first"] });
    expect(await tableNames(db)).not.toContain("third");
  });

  it("does nothing on an empty list", async () => {
    const { db, dialect } = await freshDb();
    expect(await migrateToLatest(db, dialect, {})).toEqual([]);
  });
});
