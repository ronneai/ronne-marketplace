import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { seedUser } from "../../shelves/repositories/test-seed";
import type { FeedbackKind } from "../models/feedback";
import { kyselyFeedbackRepository } from "./kysely-feedback-repository";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const repo = () => kyselyFeedbackRepository(t.db, t.dialect);

const send = (user: string, kind: FeedbackKind, message: string, page: string | null = null) =>
  repo().insert(user, { kind, message, page }, { version: "1.2.3", at: new Date() });

const query = { sort: "created", dir: "desc", size: 25 } as const;

describe("kyselyFeedbackRepository", () => {
  it("stores a message and reads it back with its sender", async () => {
    const u = await seedUser(t, "Uma");
    const id = await send(u, "problem", "The <b>button</b> is broken", "/catalogue");
    expect(await repo().find(id)).toMatchObject({
      id,
      kind: "problem",
      message: "The <b>button</b> is broken",
      page: "/catalogue",
      version: "1.2.3",
      status: "new",
      handledAt: null,
      handledBy: null,
      sender: { id: u, name: "Uma" },
    });
    expect(await repo().find(newId())).toBeNull();
  });

  it("keeps a long message of many characters intact", async () => {
    const u = await seedUser(t);
    const message = `${"ação 😀 ".repeat(500)}`.slice(0, 4000);
    const id = await send(u, "idea", message);
    expect((await repo().find(id))?.message).toBe(message);
  });

  it("pages newest first and filters by kind, status and text", async () => {
    const [uma, bo] = [await seedUser(t, "Uma"), await seedUser(t, "Bo")];
    const a = await send(uma, "problem", "Search is slow");
    const b = await send(bo, "idea", "Add dark mode");
    const c = await send(uma, "praise", "Love it");
    expect((await repo().page(query)).rows.map((r) => r.id)).toEqual([c, b, a]);
    expect((await repo().page({ ...query, dir: "asc" })).rows.map((r) => r.id)).toEqual([a, b, c]);
    expect((await repo().page({ ...query, kind: "idea" })).rows.map((r) => r.id)).toEqual([b]);
    expect((await repo().page({ ...query, search: "SLOW" })).rows.map((r) => r.id)).toEqual([a]);
    // The sender's name and email are searched too.
    expect((await repo().page({ ...query, search: "bo" })).rows.map((r) => r.id)).toContain(b);
    expect((await repo().page({ ...query, search: "100%" })).rows).toEqual([]);
    await repo().markHandled([a], { by: bo, at: new Date() });
    expect((await repo().page({ ...query, status: "handled" })).rows.map((r) => r.id)).toEqual([a]);
    expect((await repo().page({ ...query, status: "new" })).rows.map((r) => r.id)).toEqual([c, b]);
    expect(await repo().count({ status: "new" })).toEqual({ count: 2, capped: false });
  });

  it("searches % and _ as themselves", async () => {
    const u = await seedUser(t);
    const a = await send(u, "idea", "100% sure");
    await send(u, "idea", "axb and 1000 sure");
    const b = await send(u, "idea", "a_b");
    const ids = async (search: string) =>
      (await repo().page({ ...query, search })).rows.map((r) => r.id);
    expect(await ids("100%")).toEqual([a]);
    expect(await ids("a_b")).toEqual([b]);
  });

  it("sorts by kind, then by id", async () => {
    const u = await seedUser(t);
    const a = await send(u, "question", "q");
    const b = await send(u, "idea", "i");
    const c = await send(u, "question", "q2");
    const asc = await repo().page({ ...query, sort: "kind", dir: "asc" });
    expect(asc.rows.map((r) => r.id)).toEqual([b, a, c]);
  });

  it("pages with cursors", async () => {
    const u = await seedUser(t);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await send(u, "idea", `m${i}`));
    const first = await repo().page({ ...query, size: 2 });
    expect(first.rows.map((r) => r.id)).toEqual([ids[4], ids[3]]);
    expect(first.previous).toBeNull();
    const second = await repo().page({ ...query, size: 2, cursor: first.next ?? undefined });
    expect(second.rows.map((r) => r.id)).toEqual([ids[2], ids[1]]);
    expect(second.previous).not.toBeNull();
  });

  it("counts the new ones", async () => {
    const u = await seedUser(t);
    expect(await repo().countNew()).toBe(0);
    const a = await send(u, "idea", "one");
    await send(u, "idea", "two");
    expect(await repo().countNew()).toBe(2);
    await repo().markHandled([a], { by: u, at: new Date() });
    expect(await repo().countNew()).toBe(1);
  });

  it("marks only the rows asked for, once, and says which changed", async () => {
    const u = await seedUser(t);
    const [a, b, c] = [
      await send(u, "idea", "1"),
      await send(u, "idea", "2"),
      await send(u, "idea", "3"),
    ];
    const at = new Date("2026-10-22T10:00:00Z");
    expect(await repo().markHandled([a, b, newId()], { by: u, at })).toEqual(
      expect.arrayContaining([a, b]),
    );
    expect(await repo().find(a)).toMatchObject({ status: "handled", handledBy: u, handledAt: at });
    expect((await repo().find(c))?.status).toBe("new");
    // Already handled: nothing changes, and the first time stays.
    expect(await repo().markHandled([a], { by: u, at: new Date() })).toEqual([]);
    expect((await repo().find(a))?.handledAt).toEqual(at);
    expect(await repo().markHandled([], { by: u, at })).toEqual([]);
  });

  it("deletes only the rows asked for", async () => {
    const u = await seedUser(t);
    const [a, b] = [await send(u, "idea", "1"), await send(u, "idea", "2")];
    expect(await repo().remove([a, newId()], { at: new Date() })).toEqual([a]);
    expect(await repo().find(a)).toBeNull();
    expect(await repo().find(b)).not.toBeNull();
    expect(await repo().remove([], { at: new Date() })).toEqual([]);
  });
});
