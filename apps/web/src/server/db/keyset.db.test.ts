import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "./dates";
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
