import { describe, expect, it } from "vitest";
import { columnTypes } from "./column-types";
import { fromDbDate, toDbDate } from "./dates";
import { isId, newId } from "./ids";
import { decodeJson, encodeJson } from "./json";
import { containsInsensitive, escapeLike } from "./search";
import { compileOnly } from "./testing/compile-only";
import { upsert } from "./upsert";
import type { DatabaseDialect } from "./url";

type TestDb = { item: { id: string; name: string; updated_at: string } };
const DIALECTS: DatabaseDialect[] = ["sqlite", "mysql", "postgres"];

describe("newId", () => {
  it("returns sortable ULIDs", () => {
    const first = newId();
    const second = newId();
    expect(isId(first)).toBe(true);
    expect(first).toHaveLength(26);
    expect(first < second || first.slice(0, 10) === second.slice(0, 10)).toBe(true);
  });

  it("rejects things that aren't ULIDs", () => {
    expect(isId("not-an-id")).toBe(false);
    expect(isId("01ARZ3NDEKTSV4RRFFQ69G5FAI")).toBe(false); // I isn't in the ULID alphabet
  });
});

describe("columnTypes", () => {
  const createSql = (dialect: DatabaseDialect) => {
    const t = columnTypes(dialect);
    return compileOnly(dialect)
      .schema.createTable("example")
      .addColumn("id", t.id(), (c) => c.primaryKey())
      .addColumn("name", t.string(255))
      .addColumn("body", t.text())
      .addColumn("created_at", t.timestamp())
      .addColumn("data", t.json())
      .addColumn("flag", t.boolean())
      .compile().sql;
  };

  it("uses text for timestamps and integer for booleans in SQLite", () => {
    expect(createSql("sqlite")).toBe(
      'create table "example" ("id" varchar(26) primary key, "name" varchar(255), "body" text, "created_at" text, "data" text, "flag" integer)',
    );
  });

  it("uses datetime(3) in MySQL, never timestamp", () => {
    const ddl = createSql("mysql");
    expect(ddl).toContain("`created_at` datetime(3)");
    expect(ddl).not.toMatch(/\btimestamp\b/);
    expect(ddl).toContain("`flag` boolean");
  });

  it("uses timestamptz in PostgreSQL", () => {
    expect(createSql("postgres")).toContain('"created_at" timestamptz');
  });
});

describe("dates", () => {
  const date = new Date("2045-01-01T12:34:56.789Z");

  it("writes ISO text for SQLite and Dates elsewhere", () => {
    expect(toDbDate(date, "sqlite")).toBe("2045-01-01T12:34:56.789Z");
    expect(toDbDate(date, "mysql")).toBe(date);
    expect(toDbDate(date, "postgres")).toBe(date);
  });

  it("reads both shapes back as Dates", () => {
    expect(fromDbDate("2045-01-01T12:34:56.789Z")).toEqual(date);
    expect(fromDbDate(date)).toBe(date);
    expect(fromDbDate(null)).toBeNull();
    expect(() => fromDbDate("yesterday")).toThrowError(/Not a valid timestamp/);
  });
});

describe("json", () => {
  it("round-trips values and keeps null as null", () => {
    const value = { tags: ["a", "b"], nested: { n: 1 } };
    expect(decodeJson(encodeJson(value))).toEqual(value);
    expect(decodeJson(null)).toBeNull();
  });
});

describe("containsInsensitive", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_off!")).toBe("50!%!_off!!");
  });

  it.each(DIALECTS)("compiles the same lower() LIKE … ESCAPE for %s", (dialect) => {
    const { sql, parameters } = compileOnly<TestDb>(dialect)
      .selectFrom("item")
      .select("id")
      .where(containsInsensitive("name", "Code_R"))
      .compile();
    expect(sql).toMatch(/lower\(["`]name["`]\) like (\?|\$1) escape '!'/);
    expect(parameters).toEqual(["%code!_r%"]);
  });
});

describe("upsert", () => {
  const values = { id: "01J00000000000000000000000", name: "x", updated_at: "t" };
  const compile = (dialect: DatabaseDialect) =>
    upsert(
      compileOnly<TestDb>(dialect),
      dialect,
      "item",
      values,
      ["id"],
      ["name", "updated_at"],
    ).compile().sql;

  it("uses ON CONFLICT … DO UPDATE with excluded in SQLite and PostgreSQL", () => {
    for (const dialect of ["sqlite", "postgres"] as const) {
      expect(compile(dialect)).toContain(
        'on conflict ("id") do update set "name" = "excluded"."name", "updated_at" = "excluded"."updated_at"',
      );
    }
  });

  it("uses ON DUPLICATE KEY UPDATE with VALUES() in MySQL", () => {
    expect(compile("mysql")).toContain(
      "on duplicate key update `name` = values(`name`), `updated_at` = values(`updated_at`)",
    );
  });

  it("refuses an upsert with nothing to update", () => {
    expect(() =>
      upsert(compileOnly<TestDb>("sqlite"), "sqlite", "item", values, ["id"], []),
    ).toThrowError();
  });
});
