import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { INSTANCE_SHELF, type Shelf } from "../models/shelf";
import { kyselyPinRepository } from "./kysely-pin-repository";
import { seedItem, seedUser, seedWorkspace } from "./test-seed";

let t: TestDb;
let repo: ReturnType<typeof kyselyPinRepository>;
let by: string;
let acme: Shelf;
const now = new Date();

const names = ["a", "b", "c", "d"];
let items: string[];

const order = async (shelf: Shelf) =>
  (await repo.list(shelf)).map((pin) => names[items.indexOf(pin.itemId)]);

beforeEach(async () => {
  t = await createTestDb();
  repo = kyselyPinRepository(t.db, t.dialect);
  by = await seedUser(t);
  acme = { kind: "workspace", workspaceId: await seedWorkspace(t, "acme") };
  items = await Promise.all(names.map((n) => seedItem(t, n)));
});
afterEach(() => t.cleanup());

const pin = (shelf: Shelf, i: number, limit = 12) =>
  repo.add(shelf, items[i] as string, by, now, limit);

describe("pins", () => {
  it("puts new pins last, once", async () => {
    expect(await pin(INSTANCE_SHELF, 2)).toBe("added");
    expect(await pin(INSTANCE_SHELF, 0)).toBe("added");
    expect(await pin(INSTANCE_SHELF, 2)).toBe("exists");
    expect(await order(INSTANCE_SHELF)).toEqual(["c", "a"]);
    expect((await repo.list(INSTANCE_SHELF)).map((p) => p.position)).toEqual([1, 2]);
    expect((await repo.list(INSTANCE_SHELF))[0]?.createdBy).toBe(by);
  });

  it("keeps the instance shelf and each workspace's apart", async () => {
    await pin(INSTANCE_SHELF, 0);
    await pin(acme, 0);
    await pin(acme, 1);
    expect(await repo.count(INSTANCE_SHELF)).toBe(1);
    expect(await repo.count(acme)).toBe(2);
    expect(await repo.shelvesOf(items[0] as string)).toEqual({
      instance: true,
      workspaceIds: [acme.kind === "workspace" ? acme.workspaceId : ""],
    });
    expect(await repo.shelvesOf(items[2] as string)).toEqual({ instance: false, workspaceIds: [] });
  });

  it("refuses at the limit", async () => {
    await pin(acme, 0, 2);
    await pin(acme, 1, 2);
    expect(await pin(acme, 2, 2)).toBe("full");
    expect(await pin(acme, 0, 2)).toBe("exists");
  });

  it("moves up and down, and stops at the ends", async () => {
    for (const i of [0, 1, 2]) await pin(acme, i);
    expect(await repo.move(acme, items[2] as string, "up")).toBe("moved");
    expect(await order(acme)).toEqual(["a", "c", "b"]);
    expect(await repo.move(acme, items[0] as string, "up")).toBe("edge");
    expect(await repo.move(acme, items[1] as string, "down")).toBe("edge");
    expect(await repo.move(acme, items[0] as string, "down")).toBe("moved");
    expect(await order(acme)).toEqual(["c", "a", "b"]);
    expect(await repo.move(acme, items[3] as string, "up")).toBe("missing");
    expect((await repo.list(acme)).map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it("closes the gap when one is removed", async () => {
    for (const i of [0, 1, 2]) await pin(acme, i);
    expect(await repo.remove(acme, items[1] as string)).toBe(true);
    expect(await repo.remove(acme, items[1] as string)).toBe(false);
    expect((await repo.list(acme)).map((p) => p.position)).toEqual([1, 2]);
    expect(await pin(acme, 3)).toBe("added");
    expect(await order(acme)).toEqual(["a", "c", "d"]);
  });

  it("two pins at once cannot pass the limit or repeat", async () => {
    const outcomes = await Promise.all([0, 1, 2, 3, 3].map((i) => pin(INSTANCE_SHELF, i, 3)));
    expect(outcomes.filter((o) => o === "added")).toHaveLength(3);
    expect(await repo.count(INSTANCE_SHELF)).toBe(3);
    expect((await repo.list(INSTANCE_SHELF)).map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it("goes with its item and its workspace", async () => {
    await pin(acme, 0);
    await pin(INSTANCE_SHELF, 0);
    await pin(INSTANCE_SHELF, 1);
    await t.db
      .deleteFrom("item_pins")
      .where("shelf", "=", "instance")
      .where("item_id", "=", items[1] as string)
      .execute();
    await t.db
      .deleteFrom("items")
      .where("id", "=", items[0] as string)
      .execute();
    expect(await repo.count(INSTANCE_SHELF)).toBe(0);
    expect(await repo.count(acme)).toBe(0);
  });

  it("keeps positions dense and unique after an item's deletion removes its pins", async () => {
    for (const i of [0, 1, 2]) await pin(acme, i);
    await t.db
      .deleteFrom("items")
      .where("id", "=", items[1] as string)
      .execute();
    await pin(acme, 3);
    expect(await order(acme)).toEqual(["a", "c", "d"]);
    expect((await repo.list(acme)).map((p) => p.position)).toEqual([1, 2, 3]);
  });

  it("stays dense and within the limit when adds, removes and moves run at once", async () => {
    const moves = [0, 1, 2, 3].flatMap((i) => [
      pin(INSTANCE_SHELF, i, 3),
      repo.remove(INSTANCE_SHELF, items[(i + 1) % 4] as string),
      repo.move(INSTANCE_SHELF, items[i] as string, i % 2 ? "up" : "down"),
    ]);
    await Promise.all(moves);
    const list = await repo.list(INSTANCE_SHELF);
    expect(list.length).toBeLessThanOrEqual(3);
    expect(list.map((p) => p.position)).toEqual(list.map((_, i) => i + 1));
  });

  it("takes ids in any case, as MySQL would match them", async () => {
    const lower = (items[0] as string).toLowerCase();
    expect(await repo.add(INSTANCE_SHELF, lower, by, now, 12)).toBe("added");
    expect(await repo.add(INSTANCE_SHELF, items[0] as string, by, now, 12)).toBe("exists");
    expect(await repo.shelvesOf(lower)).toEqual({ instance: true, workspaceIds: [] });
    expect(await repo.remove(INSTANCE_SHELF, lower)).toBe(true);
  });
});
