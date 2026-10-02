import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { SecretInAuditMetadataError } from "../exceptions/errors";
import { countAuditEvents, findAuditEvent, listAuditEvents, recordAudit } from "./audit";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insertUser = async (email: string) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("user")
    .values({
      id,
      name: "Someone",
      email,
      email_verified: 0,
      image: null,
      created_at: now,
      updated_at: now,
      disabled_at: null,
    })
    .execute();
  return id;
};

const count = async () => (await t.db.selectFrom("audit_log").select("id").execute()).length;

describe("recordAudit", () => {
  it("stores the event with its actor, target, metadata and IP", async () => {
    const root = await insertUser("root@example.com");
    await recordAudit(t.db, t.dialect, {
      actorId: root,
      action: "user.role_changed",
      target: { type: "user", id: root },
      metadata: { from: "user", to: "moderator" },
      ipAddress: "203.0.113.9",
    });
    const { events } = await listAuditEvents(t.db, t.dialect, {});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorId: root,
      actorEmail: "root@example.com",
      action: "user.role_changed",
      targetType: "user",
      targetId: root,
      metadata: { from: "user", to: "moderator" },
      ipAddress: "203.0.113.9",
    });
    expect(events[0]?.createdAt).toBeInstanceOf(Date);
  });

  it("writes inside the caller's transaction: a rolled-back change leaves no event", async () => {
    await expect(
      t.db.transaction().execute(async (trx) => {
        await recordAudit(trx, t.dialect, {
          actorId: null,
          action: "instance.root_created",
          target: { type: "instance" },
          metadata: { via: "cli" },
        });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await count()).toBe(0);

    await t.db.transaction().execute((trx) =>
      recordAudit(trx, t.dialect, {
        actorId: null,
        action: "instance.root_created",
        target: { type: "instance" },
      }),
    );
    expect(await count()).toBe(1);
  });

  it("stores nothing when the event is invalid", async () => {
    await expect(
      recordAudit(t.db, t.dialect, {
        actorId: null,
        action: "user.password_reset",
        target: { type: "user" },
        metadata: { newPassword: "hunter2hunter2" },
      }),
    ).rejects.toThrow(SecretInAuditMetadataError);
    expect(await count()).toBe(0);
  });
});

describe("listAuditEvents (keyset, 060)", () => {
  const failed = (i: number) =>
    recordAudit(t.db, t.dialect, {
      actorId: null,
      action: "auth.sign_in_failed",
      target: { type: "none" },
      metadata: { email: `u${i}@example.com`, reason: "invalid" },
    });
  const emails = (page: { events: { metadata: { email?: unknown } }[] }) =>
    page.events.map((e) => e.metadata.email);

  it("lists newest first and pages both ways with cursors", async () => {
    for (let i = 0; i < 7; i++) await failed(i);
    const first = await listAuditEvents(t.db, t.dialect, { size: 3 });
    expect(emails(first)).toEqual(["u6@example.com", "u5@example.com", "u4@example.com"]);
    expect(first.previous).toBeNull();

    const second = await listAuditEvents(t.db, t.dialect, { size: 3, cursor: first.next ?? "" });
    expect(emails(second)).toEqual(["u3@example.com", "u2@example.com", "u1@example.com"]);
    const last = await listAuditEvents(t.db, t.dialect, { size: 3, cursor: second.next ?? "" });
    expect(emails(last)).toEqual(["u0@example.com"]);
    expect(last.next).toBeNull();

    const back = await listAuditEvents(t.db, t.dialect, { size: 3, cursor: last.previous ?? "" });
    expect(emails(back)).toEqual(emails(second));
    expect(await countAuditEvents(t.db, t.dialect, {})).toEqual({ count: 7, capped: false });
  });

  it("sorts by action, then by id, either way; oldest first when asked", async () => {
    await recordAudit(t.db, t.dialect, {
      actorId: null,
      action: "user.created",
      target: { type: "none" },
      metadata: { email: "z@example.com", role: "user" },
    });
    await failed(1);
    await failed(2);
    const actions = async (query: Parameters<typeof listAuditEvents>[2]) =>
      (await listAuditEvents(t.db, t.dialect, query)).events.map(
        (e) => `${e.action}:${e.metadata.email}`,
      );
    expect(await actions({ sort: "action" })).toEqual([
      "auth.sign_in_failed:u1@example.com",
      "auth.sign_in_failed:u2@example.com",
      "user.created:z@example.com",
    ]);
    expect(await actions({ sort: "action", dir: "desc" })).toEqual([
      "user.created:z@example.com",
      "auth.sign_in_failed:u2@example.com",
      "auth.sign_in_failed:u1@example.com",
    ]);
    expect(await actions({ dir: "asc" })).toEqual([
      "user.created:z@example.com",
      "auth.sign_in_failed:u1@example.com",
      "auth.sign_in_failed:u2@example.com",
    ]);
  });

  it("filters by action, group, actor email (or system) and dates; counts the same", async () => {
    const root = await insertUser("Root@Example.com");
    const alex = await insertUser("alex@example.com");
    const record = (
      action: "auth.signed_in" | "access_token.created" | "user.created",
      actorId: string | null,
      at: string,
    ) =>
      recordAudit(
        t.db,
        t.dialect,
        { actorId, action, target: { type: "user", id: alex } },
        new Date(at),
      );
    await record("auth.signed_in", root, "2026-09-01T10:00:00Z");
    await record("access_token.created", root, "2026-09-02T10:00:00Z");
    await record("user.created", null, "2026-09-03T10:00:00Z");
    await record("auth.signed_in", alex, "2026-09-04T10:00:00Z");

    const actions = async (filters: Parameters<typeof listAuditEvents>[2]) =>
      (await listAuditEvents(t.db, t.dialect, filters)).events.map((e) => e.action);

    expect(await actions({ action: "access_token.created" })).toEqual(["access_token.created"]);
    expect(await actions({ group: "auth" })).toEqual(["auth.signed_in", "auth.signed_in"]);
    expect(await actions({ actor: "ROOT@" })).toEqual(["access_token.created", "auth.signed_in"]);
    expect(await actions({ actor: "system" })).toEqual(["user.created"]);
    expect(await actions({ actor: "%" })).toEqual([]);
    expect(
      await actions({
        from: new Date("2026-09-02T00:00:00Z"),
        to: new Date("2026-09-03T00:00:00Z"),
      }),
    ).toEqual(["access_token.created"]);
    expect(await countAuditEvents(t.db, t.dialect, { group: "auth" })).toEqual({
      count: 2,
      capped: false,
    });

    // A user target's email comes along, so the log can say who.
    const [latest] = (await listAuditEvents(t.db, t.dialect, {})).events;
    expect(latest).toMatchObject({
      actorEmail: "alex@example.com",
      targetEmail: "alex@example.com",
    });
  });

  it("finds one event by id, with the same fields", async () => {
    await failed(1);
    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events;
    expect(await findAuditEvent(t.db, t.dialect, event?.id ?? "")).toEqual(event);
    expect(await findAuditEvent(t.db, t.dialect, newId())).toBeNull();
  });
});
