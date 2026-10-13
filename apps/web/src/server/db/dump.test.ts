import { describe, expect, it } from "vitest";
import { encodeRow, encodeValue, partPath } from "./dump";
import { foreignKeyOrder, type TableSchema } from "./introspect";

const table = (name: string, references: string[] = []): TableSchema => ({
  name,
  columns: [{ name: "id", type: "varchar", nullable: false }],
  primaryKey: ["id"],
  references,
});

describe("the backup's value encoding (099)", () => {
  it("writes each kind of value as the format says", () => {
    expect(encodeValue(null, "t.c")).toBeNull();
    // SQLite's text timestamps (`…_at`): checked as a restore checks them.
    const timed: TableSchema = {
      name: "t",
      columns: [{ name: "created_at", type: "text", nullable: false }],
      primaryKey: ["created_at"],
      references: [],
    };
    expect(encodeRow({ created_at: "2026-10-12T15:31:02.123Z" }, timed)).toBe(
      '{"created_at":"2026-10-12T15:31:02.123Z"}\n',
    );
    for (const bad of [
      "0000-01-01T00:00:00.000Z",
      "-000001-01-01T00:00:00.000Z",
      "2026-02-30T00:00:00.000Z",
      "yesterday",
    ])
      expect(() => encodeRow({ created_at: bad }, timed), bad).toThrow(
        /isn't a timestamp a restore takes/,
      );
    // A blob or a number SQLite let into a timestamp column.
    for (const bad of [Buffer.from("2026-10-13T07:04:53.834Z"), 1760000000000])
      expect(() => encodeRow({ created_at: bad }, timed)).toThrow(
        /isn't a timestamp a restore takes/,
      );
    const nullable = { ...timed, columns: [{ name: "created_at", type: "text", nullable: true }] };
    expect(encodeRow({ created_at: null }, nullable)).toBe('{"created_at":null}\n');
    // Year 0000: valid ISO 8601, but no restore takes it.
    const yearZero = new Date(0);
    yearZero.setUTCFullYear(0, 0, 1);
    expect(() => encodeValue(yearZero, "t.c")).toThrow(/outside the years 1 to 9999/);
    expect(() => encodeValue(new Date("+010000-01-01T00:00:00.000Z"), "t.c")).toThrow(
      /outside the years 1 to 9999/,
    );
    expect(encodeValue(undefined, "t.c")).toBeNull();
    expect(encodeValue("@incident/notes", "t.c")).toBe("@incident/notes");
    expect(encodeValue(true, "t.c")).toBe(true);
    expect(encodeValue(0, "t.c")).toBe(0);
    expect(encodeValue(Number.MAX_SAFE_INTEGER, "t.c")).toBe(Number.MAX_SAFE_INTEGER);
    expect(encodeValue(42n, "t.c")).toBe(42);
    expect(encodeValue(new Date("2026-10-12T15:31:02.123Z"), "t.c")).toBe(
      "2026-10-12T15:31:02.123Z",
    );
    expect(encodeValue(new Uint8Array([0, 1, 2]), "t.c")).toEqual({ $b64: "AAEC" });
    expect(encodeValue(Buffer.from("hi"), "t.c")).toEqual({ $b64: "aGk=" });
  });

  it("stops on a value a restore would read differently, naming the column", () => {
    expect(() => encodeValue(1.5, "items.size")).toThrow("items.size holds 1.5");
    expect(() => encodeValue(2 ** 53, "items.size")).toThrow(
      "isn't an integer the format can carry",
    );
    expect(() => encodeValue(2n ** 60n, "t.c")).toThrow("larger than the format's integers");
    expect(() => encodeValue(new Date(Number.NaN), "t.c")).toThrow("an invalid date");
    expect(() => encodeValue({ a: 1 }, "t.c")).toThrow("doesn't carry");
  });

  it("writes a row's columns in the table's order, every column present", () => {
    const users: TableSchema = {
      name: "user",
      columns: [
        { name: "id", type: "varchar", nullable: false },
        { name: "image", type: "text", nullable: true },
        { name: "email_verified", type: "integer", nullable: false },
      ],
      primaryKey: ["id"],
      references: [],
    };
    expect(encodeRow({ email_verified: 1, id: "u1", extra: "ignored" }, users)).toBe(
      '{"id":"u1","image":null,"email_verified":1}\n',
    );
  });

  it("names parts database/<table>/<six digits>.jsonl", () => {
    expect(partPath("user", 1)).toBe("database/user/000001.jsonl");
    expect(partPath("item_versions", 123456)).toBe("database/item_versions/123456.jsonl");
  });
});

describe("foreign-key order (099)", () => {
  it("puts each table after the tables it points to, ties by name", () => {
    const order = foreignKeyOrder([
      table("dist_tags", ["item_versions", "items"]),
      table("item_versions", ["items", "user"]),
      table("items", ["user"]),
      table("user"),
      table("audit_log", ["user"]),
    ]).map((t) => t.name);
    expect(order).toEqual(["user", "audit_log", "items", "item_versions", "dist_tags"]);
  });

  it("ignores references to tables it wasn't given, and refuses a cycle", () => {
    expect(foreignKeyOrder([table("a", ["elsewhere"])]).map((t) => t.name)).toEqual(["a"]);
    expect(() => foreignKeyOrder([table("a", ["b"]), table("b", ["a"])])).toThrow(
      "form a cycle: a → b → a",
    );
  });
});
