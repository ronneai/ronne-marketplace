import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { seedUser } from "../../shelves/repositories/test-seed";
import type { NotificationKind } from "../models/notification";
import { notify } from "../services/notify";
import { kyselyNotificationRepository } from "./kysely-notification-repository";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const repo = () => kyselyNotificationRepository(t.db, t.dialect);

const tell = (
  recipients: string[],
  extra: { actorId?: string | null; kind?: NotificationKind; at?: Date } = {},
) =>
  notify(
    t.db,
    t.dialect,
    {
      recipients,
      kind: extra.kind ?? "submission.approved",
      actorId: extra.actorId ?? null,
      subject: { type: "submission", id: newId() },
      params: { item: "@a/b" },
    },
    extra.at,
  );

describe("notify", () => {
  it("writes one row per recipient, never to the actor or twice", async () => {
    const [ana, bruno, cara] = [
      await seedUser(t, "Ana"),
      await seedUser(t, "Bruno"),
      await seedUser(t, "Cara"),
    ];
    expect(await tell([ana, ana, bruno, cara], { actorId: bruno })).toBe(2);
    const rows = await t.db.selectFrom("notifications").select(["user_id", "actor_id"]).execute();
    expect(rows.map((r) => r.user_id).sort()).toEqual([ana, cara].sort());
    expect(rows.every((r) => r.actor_id === bruno)).toBe(true);
  });

  it("skips disabled and erased accounts, and unknown ids", async () => {
    const [ana, off, gone] = [
      await seedUser(t),
      await seedUser(t, "Off"),
      await seedUser(t, "Gone"),
    ];
    const at = toDbDate(new Date(), t.dialect);
    await t.db.updateTable("user").set({ disabled_at: at }).where("id", "=", off).execute();
    await t.db.updateTable("user").set({ erased_at: at }).where("id", "=", gone).execute();
    expect(await tell([ana, off, gone, "1".repeat(26)])).toBe(1);
  });

  it("writes nothing when the surrounding transaction rolls back", async () => {
    const ana = await seedUser(t);
    await expect(
      t.db.transaction().execute(async (trx) => {
        await notify(trx, t.dialect, {
          recipients: [ana],
          kind: "submission.rejected",
          actorId: null,
          subject: { type: "submission", id: newId() },
        });
        throw new Error("the decision failed");
      }),
    ).rejects.toThrow("the decision failed");
    expect(await t.db.selectFrom("notifications").selectAll().execute()).toEqual([]);
  });

  it("refuses parameters that don't fit, writing nothing", async () => {
    const ana = await seedUser(t);
    await expect(
      notify(t.db, t.dialect, {
        recipients: [ana],
        kind: "submission.comment",
        actorId: null,
        subject: { type: "submission", id: "x" },
        params: { text: "x".repeat(3000) },
      }),
    ).rejects.toThrow(/bytes/);
    expect(await t.db.selectFrom("notifications").selectAll().execute()).toEqual([]);
  });
});

describe("the repository", () => {
  it("lists a person's own notifications, newest first, in pages", async () => {
    const [ana, bruno] = [await seedUser(t, "Ana"), await seedUser(t, "Bruno")];
    for (let i = 0; i < 5; i++) await tell([ana], { at: new Date(2026, 9, 1, 0, 0, i) });
    await tell([bruno]);
    const first = await repo().page({ userId: ana, size: 3 });
    expect(first.rows).toHaveLength(3);
    expect(first.next).not.toBeNull();
    const second = await repo().page({ userId: ana, size: 3, cursor: first.next ?? undefined });
    expect(second.rows).toHaveLength(2);
    expect(second.next).toBeNull();
    const ids = [...first.rows, ...second.rows].map((n) => n.id);
    expect(ids).toEqual([...ids].sort().reverse());
    expect(new Set(ids).size).toBe(5);
  });

  it("filters by read state and kind", async () => {
    const ana = await seedUser(t);
    await tell([ana], { kind: "submission.approved" });
    await tell([ana], { kind: "submission.rejected" });
    const [first] = (await repo().latest(ana, 10)).map((n) => n.id);
    await repo().markRead(ana, [first as string], new Date());
    expect((await repo().page({ userId: ana, size: 10, state: "unread" })).rows).toHaveLength(1);
    expect((await repo().page({ userId: ana, size: 10, state: "read" })).rows).toHaveLength(1);
    const rejected = await repo().page({ userId: ana, size: 10, kinds: ["submission.rejected"] });
    expect(rejected.rows.map((n) => n.kind)).toEqual(["submission.rejected"]);
    // Several kinds at once: any of them.
    const both = await repo().page({
      userId: ana,
      size: 10,
      kinds: ["submission.rejected", "submission.approved"],
    });
    expect(both.rows).toHaveLength(2);
    const other = await repo().page({ userId: ana, size: 10, kinds: ["submission.comment"] });
    expect(other.rows).toEqual([]);
    // None given is every kind.
    expect((await repo().page({ userId: ana, size: 10, kinds: [] })).rows).toHaveLength(2);
  });

  it("counts unread up to the cap, and marking read lowers it", async () => {
    const ana = await seedUser(t);
    for (let i = 0; i < 5; i++) await tell([ana]);
    expect(await repo().countUnread(ana, 100)).toBe(5);
    expect(await repo().countUnread(ana, 3)).toBe(3);
    expect(await repo().markAllRead(ana, new Date())).toBe(5);
    expect(await repo().countUnread(ana, 100)).toBe(0);
    expect(await repo().markAllRead(ana, new Date())).toBe(0);
  });

  it("marks only the person's own, unread rows read", async () => {
    const [ana, bruno] = [await seedUser(t, "Ana"), await seedUser(t, "Bruno")];
    await tell([ana, bruno]);
    const [mine] = await repo().latest(ana, 1);
    const [his] = await repo().latest(bruno, 1);
    expect(
      await repo().markRead(
        ana,
        [(mine as { id: string }).id, (his as { id: string }).id],
        new Date(),
      ),
    ).toEqual([(mine as { id: string }).id]);
    expect(await repo().markRead(ana, [(mine as { id: string }).id], new Date())).toEqual([]);
    expect(await repo().countUnread(bruno, 100)).toBe(1);
  });

  it("reads parameters back, and skips a kind this version doesn't know", async () => {
    const ana = await seedUser(t);
    await tell([ana]);
    await t.db
      .insertInto("notifications")
      .values({
        id: newId(),
        user_id: ana,
        kind: "from.the.future",
        subject_type: "submission",
        subject_id: "x",
        params: "{}",
        created_at: toDbDate(new Date(), t.dialect),
      })
      .execute();
    const rows = await repo().latest(ana, 10);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "submission.approved",
      params: { item: "@a/b" },
      readAt: null,
    });
  });

  it("deletes only what is older than the cut-off", async () => {
    const ana = await seedUser(t);
    await tell([ana], { at: new Date("2026-01-01T00:00:00Z") });
    await tell([ana], { at: new Date("2026-10-01T00:00:00Z") });
    expect(await repo().deleteOlderThan(new Date("2026-06-01T00:00:00Z"))).toBe(1);
    expect(await t.db.selectFrom("notifications").selectAll().execute()).toHaveLength(1);
  });
});
