import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { withRequestContext } from "../../../log";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { seedErasedUser } from "../../identity/testing/erased-user";
import type { AuditAction, AuditTargetType } from "../models/audit-event";
import type { AuditFilters } from "../repositories/audit-repository";
import { kyselyAuditRepository } from "../repositories/kysely-audit-repository";
import { countAuditEvents, findAuditEvent, listAuditEvents, recordAudit } from "./audit";
import { appAuditEvent, appAuditPage, appAuditWorkspaces } from "./audit-page";

// The audit page's filters and names (166), on the database in TEST_DATABASE_URL.
let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insertUser = async (name: string, email: string) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("user")
    .values({
      id,
      name,
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

const insertWorkspace = async (name: string) => {
  const id = newId();
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name,
      description: "",
      visibility: "public",
      is_global: toDbBoolean(false, t.dialect),
      owner_id: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return id;
};

let second = 0;
/** One event, a second after the last, in a request when `requestId` is given. */
const event = async (fields: {
  actorId?: string | null;
  action?: AuditAction;
  workspaceId?: string | null;
  requestId?: string;
  target?: { type: AuditTargetType; id?: string | null };
  metadata?: Record<string, string>;
}) => {
  const record = () =>
    recordAudit(
      t.db,
      t.dialect,
      {
        actorId: fields.actorId ?? null,
        action: fields.action ?? "submission.submitted",
        target: fields.target ?? { type: "submission", id: newId() },
        metadata: fields.metadata ?? {},
        workspaceId: fields.workspaceId ?? null,
      },
      new Date(Date.UTC(2026, 9, 1, 12, 0, second++)),
    );
  if (fields.requestId) await withRequestContext({ requestId: fields.requestId }, record);
  else await record();
};

/** Every page of a filter, two at a time, newest first: the ids in order, and the count. */
const allPages = async (filters: AuditFilters) => {
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let pages = 0; pages < 20; pages++) {
    const page = await listAuditEvents(t.db, t.dialect, { ...filters, size: 2, cursor });
    ids.push(...page.events.map((e) => e.id));
    if (!page.next) break;
    cursor = page.next;
  }
  const { count } = await countAuditEvents(t.db, t.dialect, filters);
  return { ids, count };
};

const idsOf = async (filters: AuditFilters) =>
  (await listAuditEvents(t.db, t.dialect, { ...filters, size: 100 })).events.map((e) => e.id);

describe("the audit page's filters (166)", () => {
  it("filters by workspace across keyset pages, and counts the same", async () => {
    const acme = await insertWorkspace("acme");
    const beta = await insertWorkspace("beta");
    for (let i = 0; i < 5; i++) await event({ workspaceId: acme });
    for (let i = 0; i < 3; i++) await event({ workspaceId: beta });
    await event({ action: "user.created", target: { type: "instance" } });
    const everything = await idsOf({});
    const acmeIds = await idsOf({ workspace: acme });
    expect(acmeIds).toHaveLength(5);
    expect(await allPages({ workspace: acme })).toEqual({ ids: acmeIds, count: 5 });
    expect(await allPages({ workspace: beta })).toMatchObject({ count: 3 });
    // The pages hold exactly the filter's events, newest first, as the unfiltered list orders them.
    expect(acmeIds).toEqual(everything.filter((id) => acmeIds.includes(id)));
    // Sorted by action too, the other keyset.
    const byAction = await listAuditEvents(t.db, t.dialect, {
      workspace: acme,
      sort: "action",
      dir: "asc",
      size: 2,
    });
    expect(byAction.events).toHaveLength(2);
    expect(byAction.next).not.toBeNull();
    // A workspace with nothing, and one that never existed.
    expect(await idsOf({ workspace: await insertWorkspace("empty") })).toEqual([]);
    expect(await idsOf({ workspace: newId() })).toEqual([]);
  });

  it("filters by request ID exactly: case, part or padding find nothing", async () => {
    await event({ requestId: "01K9REQUESTAAAAAAAAAAAAAAA" });
    await event({ requestId: "01K9REQUESTAAAAAAAAAAAAAAA" });
    await event({ requestId: "lb-123.abc_Z" });
    await event({});
    const one = await allPages({ requestId: "01K9REQUESTAAAAAAAAAAAAAAA" });
    expect(one.ids).toHaveLength(2);
    expect(one.count).toBe(2);
    expect(await idsOf({ requestId: "lb-123.abc_Z" })).toHaveLength(1);
    for (const near of [
      "01k9requestaaaaaaaaaaaaaaa",
      "01K9REQUEST",
      "01K9REQUESTAAAAAAAAAAAAAAA ",
      "LB-123.ABC_Z",
      // Not an ID at all: never sent to the database as a pattern.
      "%",
      "a b",
      "",
    ])
      expect(await idsOf({ requestId: near }), JSON.stringify(near)).toEqual([]);
    expect((await countAuditEvents(t.db, t.dialect, { requestId: "%" })).count).toBe(0);
  });

  it("finds the actor by part of their name or their email, any case", async () => {
    const ana = await insertUser("Ana Souza", "ana@example.com");
    const bob = await insertUser("Bob", "bob@example.org");
    for (const actorId of [ana, bob, ana, null]) await event({ actorId });
    const actors = async (actor: string) =>
      (await listAuditEvents(t.db, t.dialect, { actor, size: 100 })).events.map((e) => e.actorId);
    expect(await actors("souza")).toEqual([ana, ana]);
    expect(await actors("ANA S")).toEqual([ana, ana]);
    expect(await actors("ana@example.com")).toEqual([ana, ana]);
    expect(await actors("example.org")).toEqual([bob]);
    expect(await actors("system")).toEqual([null]);
    // Pages and the count agree under the name filter.
    expect(await allPages({ actor: "souza" })).toMatchObject({ count: 2 });
    expect((await allPages({ actor: "souza" })).ids).toHaveLength(2);
    // LIKE's wildcards are the characters themselves.
    expect(await actors("%")).toEqual([]);
  });

  it("combines the filters", async () => {
    const acme = await insertWorkspace("acme");
    const ana = await insertUser("Ana", "ana@example.com");
    await event({ actorId: ana, workspaceId: acme, requestId: "r-1" });
    await event({ actorId: ana, workspaceId: acme, requestId: "r-2" });
    await event({
      actorId: ana,
      requestId: "r-1",
      action: "user.created",
      target: { type: "instance" },
    });
    expect(await idsOf({ workspace: acme, requestId: "r-1", actor: "ana" })).toHaveLength(1);
    expect(await idsOf({ workspace: acme, group: "submission" })).toHaveLength(2);
    expect(await idsOf({ requestId: "r-1", group: "user" })).toHaveLength(1);
  });
});

describe("names on the audit page (166)", () => {
  it("gives the actor's and a user target's names: an erased person's pseudonym, none for the gone", async () => {
    const ana = await insertUser("Ana Souza", "ana@example.com");
    const erased = await seedErasedUser(t);
    await event({ actorId: ana, action: "user.updated", target: { type: "user", id: erased.id } });
    await event({ actorId: erased.id, action: "auth.signed_in", target: { type: "session" } });
    // A user whose row is gone: the event keeps their id, and there's no name or email.
    const gone = await insertUser("Gone", "gone@example.com");
    await event({ actorId: gone, action: "auth.signed_in", target: { type: "session" } });
    await t.db.deleteFrom("user").where("id", "=", gone).execute();
    const { events } = await listAuditEvents(t.db, t.dialect, { size: 100 });
    const updated = events.find((e) => e.action === "user.updated");
    expect(updated).toMatchObject({
      actorName: "Ana Souza",
      actorEmail: "ana@example.com",
      targetName: erased.name,
      targetEmail: erased.email,
    });
    expect(events.find((e) => e.actorId === erased.id)).toMatchObject({
      actorName: erased.name,
      targetName: null,
    });
    // The actor key is SET NULL when a row goes: the event stays, with no one.
    expect(events.filter((e) => e.action === "auth.signed_in" && e.actorId === null)).toHaveLength(
      1,
    );
    // One event by id carries them too.
    expect(await findAuditEvent(t.db, t.dialect, updated?.id ?? "")).toMatchObject({
      actorName: "Ana Souza",
      targetName: erased.name,
    });
  });
});

describe("the Workspace filter's choices (166)", () => {
  it("lists every workspace and each deleted one by the name it had, by name", async () => {
    const zeta = await insertWorkspace("zeta");
    const acme = await insertWorkspace("acme");
    const payments = newId();
    // Deleted: only its events are left, `workspace.deleted` naming it.
    await event({
      action: "workspace.deleted",
      target: { type: "workspace", id: payments },
      workspaceId: payments,
      metadata: { name: "payments" },
    });
    // A deleted one whose name a live one took since: both are offered, told apart.
    const oldAcme = newId();
    await event({
      action: "workspace.deleted",
      target: { type: "workspace", id: oldAcme },
      workspaceId: oldAcme,
      metadata: { name: "acme" },
    });
    const choices = await kyselyAuditRepository(t.db, t.dialect).workspaces();
    const ours = choices.filter((w) => [zeta, acme, payments, oldAcme].includes(w.id));
    expect(ours).toEqual([
      { id: acme, name: "acme", deleted: false },
      { id: oldAcme, name: "acme", deleted: true },
      { id: payments, name: "payments", deleted: true },
      { id: zeta, name: "zeta", deleted: false },
    ]);
  });
});

describe("the audit page's actions (166)", () => {
  it("refuse anyone without audit.read, before reading anything", async () => {
    const query = { sort: "time", dir: "desc", size: 50 } as const;
    for (const viewer of [
      null,
      { role: "user" as const },
      { role: "user" as const, workspaces: { [newId()]: "admin" as const } },
    ]) {
      await expect(appAuditPage(viewer, query)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(appAuditEvent(viewer, newId())).rejects.toBeInstanceOf(ForbiddenError);
      await expect(appAuditWorkspaces(viewer)).rejects.toBeInstanceOf(ForbiddenError);
    }
    // Root gets past the check (this test's process has no configured instance: nothing to read).
    await expect(appAuditWorkspaces({ role: "root" })).resolves.toBeInstanceOf(Array);
  });
});
