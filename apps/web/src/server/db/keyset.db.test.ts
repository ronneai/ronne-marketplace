import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromDbDate, toDbDate } from "./dates";
import { newId } from "./ids";
import { COUNT_CAP, countCapped, decodeCursor, type KeysetSort, paginate } from "./keyset";
import { createTestDb, type TestDb } from "./testing/test-db";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

/** Rows in audit_log: any table with an id and an indexed column would do. */
const insert = async (actions: string[]) => {
  const ids: string[] = [];
  const now = toDbDate(new Date(), t.dialect);
  const rows = actions.map((action) => {
    const id = newId();
    ids.push(id);
    return {
      id,
      actor_id: null,
      action,
      target_type: "none",
      target_id: null,
      metadata: "{}",
      ip_address: null,
      created_at: now,
    };
  });
  for (let i = 0; i < rows.length; i += 200)
    await t.db
      .insertInto("audit_log")
      .values(rows.slice(i, i + 200))
      .execute();
  return ids;
};

const base = () => t.db.selectFrom("audit_log").select(["id", "action"]);
const BY_TIME: KeysetSort = { key: "time", column: "audit_log.id", dir: "desc" };
const BY_ACTION: KeysetSort = { key: "action", column: "audit_log.action", dir: "asc" };

const page = (sort: KeysetSort, size: number, cursor?: string) =>
  paginate(base(), {
    sort,
    idColumn: "audit_log.id",
    size,
    cursor,
    sortValue: (row) => (sort.key === "action" ? row.action : row.id),
    idOf: (row) => row.id,
  });

/** Every page from the first, following Next; then back again with Previous. */
const walk = async (sort: KeysetSort, size: number) => {
  const forward: string[][] = [];
  let current = await page(sort, size);
  expect(current.previous).toBeNull();
  forward.push(current.rows.map((r) => r.id));
  while (current.next) {
    current = await page(sort, size, current.next);
    forward.push(current.rows.map((r) => r.id));
  }
  const backward: string[][] = [current.rows.map((r) => r.id)];
  while (current.previous) {
    current = await page(sort, size, current.previous);
    backward.unshift(current.rows.map((r) => r.id));
  }
  return { forward, backward };
};

describe("paginate (060)", () => {
  it("pages by id, newest first, with no gap or repeat, both ways", async () => {
    const ids = await insert(Array.from({ length: 23 }, () => "user.created"));
    const { forward, backward } = await walk(BY_TIME, 10);
    expect(forward.map((p) => p.length)).toEqual([10, 10, 3]);
    expect(forward.flat()).toEqual([...ids].reverse());
    expect(backward).toEqual(forward);
  });

  it("keeps a strict order across pages when many rows share the sort value", async () => {
    const ids = await insert([
      ...Array.from({ length: 120 }, () => "user.created"),
      "auth.signed_in",
      "version.published",
    ]);
    const { forward, backward } = await walk(BY_ACTION, 50);
    const flat = forward.flat();
    expect(flat).toHaveLength(122);
    expect(new Set(flat).size).toBe(122);
    expect(flat[0]).toBe(ids[120]); // auth.* sorts first
    expect(flat.at(-1)).toBe(ids[121]); // version.* last
    expect(flat.slice(1, 121)).toEqual(ids.slice(0, 120)); // ties in id order
    expect(backward).toEqual(forward);

    const descending = await walk({ ...BY_ACTION, dir: "desc" }, 50);
    expect(descending.forward.flat()).toEqual([...flat].reverse());
  });

  it("an empty list has no pages either side", async () => {
    expect(await page(BY_TIME, 10)).toEqual({ rows: [], next: null, previous: null });
  });

  it("ignores a cursor from another sort, or one that was tampered with", async () => {
    await insert(Array.from({ length: 15 }, () => "user.created"));
    const first = await page(BY_TIME, 10);
    const fromOtherSort = await page(BY_ACTION, 10, first.next ?? "");
    expect(fromOtherSort.previous).toBeNull();
    expect(decodeCursor(first.next ?? "", "action")).toBeNull();
    for (const bad of ["nonsense", "e30", Buffer.from('{"k":"time"}').toString("base64url")]) {
      expect(decodeCursor(bad, "time")).toBeNull();
      expect((await page(BY_TIME, 10, bad)).rows).toEqual(first.rows);
    }
  });
});

describe("paginate by a date (062)", () => {
  /** Rows whose created_at repeat and differ by a millisecond, out of id order. */
  const insertAt = async (times: string[]) => {
    const rows = times.map((at) => ({
      id: newId(),
      actor_id: null,
      action: "user.created",
      target_type: "none",
      target_id: null,
      metadata: "{}",
      ip_address: null,
      created_at: toDbDate(new Date(at), t.dialect),
    }));
    await t.db.insertInto("audit_log").values(rows).execute();
    return rows;
  };
  const BY_DATE: KeysetSort = {
    key: "when",
    column: "audit_log.created_at",
    dir: "asc",
    kind: "date",
  };
  const byDate = (sort: KeysetSort, cursor?: string) =>
    paginate(t.db.selectFrom("audit_log").select(["id", "created_at"]), {
      sort,
      idColumn: "audit_log.id",
      size: 3,
      cursor,
      sortValue: (row) => fromDbDate(row.created_at),
      idOf: (row) => row.id,
      dialect: t.dialect,
    });

  it("pages by a timestamp with equal and close values, both ways, on every database", async () => {
    const rows = await insertAt([
      "2026-10-02T10:00:00.002Z",
      "2026-10-02T10:00:00.000Z",
      "2026-10-02T10:00:00.001Z",
      "2026-10-02T10:00:00.001Z",
      "2026-10-02T10:00:00.001Z",
      "2026-10-01T23:59:59.999Z",
      "2026-10-02T10:00:00.000Z",
    ]);
    // By the instant, then the id: what the database must return, whatever it stores dates as.
    const expected = [...rows]
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
          a.id.localeCompare(b.id),
      )
      .map((r) => r.id);
    for (const dir of ["asc", "desc"] as const) {
      const sort = { ...BY_DATE, dir };
      const seen: string[] = [];
      let page = await byDate(sort);
      seen.push(...page.rows.map((r) => r.id));
      while (page.next) {
        page = await byDate(sort, page.next);
        seen.push(...page.rows.map((r) => r.id));
      }
      expect(seen).toEqual(dir === "asc" ? expected : [...expected].reverse());
      const back = await byDate(sort, page.previous ?? "");
      // Seven rows in pages of three: Previous from the last page is the middle one.
      expect(back.rows.map((r) => r.id)).toEqual(seen.slice(3, 6));
    }
  });

  it("ignores a cursor whose value isn't a date, and needs a dialect", async () => {
    await insertAt(["2026-10-02T10:00:00.000Z"]);
    const bad = Buffer.from(JSON.stringify({ k: "when", v: "soon", id: "x", d: "after" })).toString(
      "base64url",
    );
    expect((await byDate(BY_DATE, bad)).rows).toHaveLength(1);
    const first = await byDate(BY_DATE);
    expect(first.next).toBeNull();
    await expect(
      paginate(t.db.selectFrom("audit_log").select(["id", "created_at"]), {
        sort: BY_DATE,
        idColumn: "audit_log.id",
        size: 1,
        cursor: Buffer.from(
          JSON.stringify({ k: "when", v: "2026-10-01T00:00:00.000Z", id: "x", d: "after" }),
        ).toString("base64url"),
        sortValue: (row) => fromDbDate(row.created_at),
        idOf: (row) => row.id,
      }),
    ).rejects.toThrow("needs a dialect");
  });
});

describe("countCapped (060)", () => {
  it("counts the filtered rows exactly up to the cap", async () => {
    await insert(["user.created", "user.created", "auth.signed_in"]);
    expect(await countCapped(t.db, base().where("action", "=", "user.created"))).toEqual({
      count: 2,
      capped: false,
    });
  });

  it("stops past the cap", async () => {
    await insert(Array.from({ length: COUNT_CAP + 5 }, () => "auth.signed_in"));
    expect(await countCapped(t.db, base())).toEqual({ count: COUNT_CAP, capped: true });
  }, 60_000);
});
