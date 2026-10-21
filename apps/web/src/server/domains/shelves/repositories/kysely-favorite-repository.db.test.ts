import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { kyselyFavoriteRepository } from "./kysely-favorite-repository";
import { seedItem, seedUser } from "./test-seed";

let t: TestDb;
let repo: ReturnType<typeof kyselyFavoriteRepository>;
let uma: string;
let ben: string;

beforeEach(async () => {
  t = await createTestDb();
  repo = kyselyFavoriteRepository(t.db, t.dialect);
  uma = await seedUser(t, "Uma");
  ben = await seedUser(t, "Ben");
});
afterEach(() => t.cleanup());

const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 10, minute));

describe("favorites", () => {
  it("adds once, says so the second time, and lists newest first", async () => {
    const [a, b, c] = [await seedItem(t, "a"), await seedItem(t, "b"), await seedItem(t, "c")];
    expect(await repo.add(uma, a as string, at(1), 5)).toBe("added");
    expect(await repo.add(uma, a as string, at(2), 5)).toBe("exists");
    await repo.add(uma, b as string, at(3), 5);
    await repo.add(uma, c as string, at(2), 5);
    expect((await repo.list(uma)).map((f) => f.itemId)).toEqual([b, c, a]);
    expect((await repo.list(uma))[2]?.createdAt).toEqual(at(1));
    expect(await repo.count(uma)).toBe(3);
  });

  it("refuses at the limit, and a removal makes room", async () => {
    const [a, b, c] = [await seedItem(t, "a"), await seedItem(t, "b"), await seedItem(t, "c")];
    await repo.add(uma, a as string, at(1), 2);
    await repo.add(uma, b as string, at(2), 2);
    expect(await repo.add(uma, c as string, at(3), 2)).toBe("full");
    expect(await repo.add(uma, a as string, at(3), 2)).toBe("exists");
    expect(await repo.remove(uma, a as string)).toBe(true);
    expect(await repo.remove(uma, a as string)).toBe(false);
    expect(await repo.add(uma, c as string, at(4), 2)).toBe("added");
  });

  it("keeps two people's lists apart", async () => {
    const [a, b] = [await seedItem(t, "a"), await seedItem(t, "b")];
    await repo.add(uma, a as string, at(1), 5);
    await repo.add(ben, b as string, at(1), 5);
    expect(await repo.has(uma, a as string)).toBe(true);
    expect(await repo.has(uma, b as string)).toBe(false);
    expect(await repo.among(ben, [a as string, b as string])).toEqual([b]);
    expect(await repo.among(ben, [])).toEqual([]);
    expect(await repo.removeAll(uma)).toBe(1);
    expect(await repo.count(uma)).toBe(0);
    expect(await repo.count(ben)).toBe(1);
  });

  it("two favorites at once cannot pass the limit", async () => {
    // One after the other: concurrent seeding deadlocks on MySQL (the catalogue revision row).
    const items = [];
    for (const n of ["a", "b", "c", "d"]) items.push(await seedItem(t, n));
    const outcomes = await Promise.all(items.map((id, i) => repo.add(uma, id, at(i), 2)));
    expect(outcomes.filter((o) => o === "added")).toHaveLength(2);
    expect(await repo.count(uma)).toBe(2);
  });

  it("takes ids in any case, as MySQL would match them", async () => {
    const item = (await seedItem(t, "a")) as string;
    expect(await repo.add(uma.toLowerCase(), item.toLowerCase(), at(1), 5)).toBe("added");
    expect(await repo.add(uma, item, at(2), 5)).toBe("exists");
    expect(await repo.has(uma.toLowerCase(), item.toLowerCase())).toBe(true);
    expect(await repo.among(uma, [item.toLowerCase()])).toEqual([item]);
    expect(await repo.remove(uma.toLowerCase(), item.toLowerCase())).toBe(true);
  });

  it("refuses an item or person that does not exist, and a limit of 0", async () => {
    const item = (await seedItem(t, "a")) as string;
    await expect(repo.add(uma, "0".repeat(26), at(1), 5)).rejects.toThrow();
    expect(await repo.add(uma, item, at(1), 0)).toBe("full");
  });
});
