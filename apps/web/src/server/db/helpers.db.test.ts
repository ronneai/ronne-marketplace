import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { columnTypes } from "./column-types";
import { fromDbDate, toDbDate } from "./dates";
import { newId } from "./ids";
import { decodeJson, encodeJson } from "./json";
import { containsInsensitive } from "./search";
import { createTestDb, type TestDb as FreshDb } from "./testing/test-db";
import { upsert, upsertAdding } from "./upsert";
import type { DatabaseDialect } from "./url";

type TestDb = {
  item: { id: string; name: string; data: string | null; created_at: string | Date };
};

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let fresh: FreshDb;
let db: Kysely<TestDb>;
let dialect: DatabaseDialect;

beforeAll(async () => {
  fresh = await createTestDb({ migrate: false });
  db = fresh.db.withTables<TestDb>() as unknown as Kysely<TestDb>;
  dialect = fresh.dialect;
  const t = columnTypes(dialect);
  await db.schema
    .createTable("item")
    .addColumn("id", t.id(), (c) => c.primaryKey())
    .addColumn("name", t.string(255), (c) => c.notNull())
    .addColumn("data", t.json())
    .addColumn("created_at", t.timestamp(), (c) => c.notNull())
    .execute();

  const now = new Date("2026-09-27T00:00:00.000Z");
  await db
    .insertInto("item")
    .values(
      ["Code-Review", "code_review", "Secure coding", "100% coverage"].map((name) => ({
        id: newId(),
        name,
        data: encodeJson({ name }),
        created_at: toDbDate(now, dialect),
      })),
    )
    .execute();
});
afterAll(() => fresh.cleanup());

const namesMatching = async (term: string) =>
  (
    await db
      .selectFrom("item")
      .select("name")
      .where(containsInsensitive("name", term))
      .orderBy("name")
      .execute()
  ).map((r) => r.name);

describe("containsInsensitive on a real database", () => {
  it("ignores case", async () => {
    expect(await namesMatching("code-r")).toEqual(["Code-Review"]);
    expect(await namesMatching("CODING")).toEqual(["Secure coding"]);
  });

  it("treats _ and % in the term as plain characters", async () => {
    expect(await namesMatching("code_r")).toEqual(["code_review"]);
    expect(await namesMatching("100%")).toEqual(["100% coverage"]);
    expect(await namesMatching("%")).toEqual(["100% coverage"]);
  });
});

describe("dates and JSON on a real database", () => {
  it("reads back the same instant and the same value", async () => {
    const row = await db
      .selectFrom("item")
      .selectAll()
      .where("name", "=", "Code-Review")
      .executeTakeFirstOrThrow();
    expect(fromDbDate(row.created_at).toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(decodeJson(row.data)).toEqual({ name: "Code-Review" });
  });
});

describe("upsert on a real database", () => {
  it("inserts, then updates the same row on conflict", async () => {
    const id = newId();
    const row = (name: string) => ({
      id,
      name,
      data: null,
      created_at: toDbDate(new Date(), dialect),
    });

    await upsert(db, dialect, "item", row("first"), ["id"], ["name"]).execute();
    await upsert(db, dialect, "item", row("second"), ["id"], ["name"]).execute();

    const rows = await db.selectFrom("item").select("name").where("id", "=", id).execute();
    expect(rows).toEqual([{ name: "second" }]);
  });
});

describe("upsertAdding on a real database", () => {
  it("inserts, then adds to the existing row on conflict", async () => {
    await db.schema
      .createTable("counter")
      .addColumn("key", columnTypes(dialect).string(32), (c) => c.primaryKey())
      .addColumn("count", "integer", (c) => c.notNull())
      .execute();
    const counters = db as unknown as Kysely<{ counter: { key: string; count: number } }>;
    const add = (count: number) =>
      upsertAdding(counters, dialect, "counter", { key: "a", count }, ["key"], ["count"]).execute();
    await add(2);
    await add(3);
    await Promise.all([add(1), add(1), add(1)]);
    const rows = await counters.selectFrom("counter").select(["key", "count"]).execute();
    expect(rows.map((r) => ({ ...r, count: Number(r.count) }))).toEqual([{ key: "a", count: 8 }]);
  });
});
