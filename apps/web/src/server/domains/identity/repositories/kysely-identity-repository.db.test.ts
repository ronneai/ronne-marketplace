import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import type { AuditAction } from "../../audit/models/audit-event";
import type { IdentityRepository } from "./identity-repository";
import { kyselyIdentityRepository } from "./kysely-identity-repository";

let t: TestDb;
let repo: IdentityRepository;
beforeEach(async () => {
  t = await createTestDb();
  repo = kyselyIdentityRepository(t.db, t.dialect);
});
afterEach(() => t.cleanup());

const add = (email: string, role: "root" | "moderator" | "user", at: string) =>
  repo.createUserWithPassword(
    {
      email,
      name: email,
      role: role === "root" ? "root" : "user",
      globalRole: role === "moderator" ? "moderator" : "user",
      passwordHash: "x",
    },
    new Date(at),
  );

describe("roots (059)", () => {
  it("lists every root oldest first, and finds the first", async () => {
    expect(await repo.findFirstRoot()).toBeNull();
    expect(await repo.listRoots()).toEqual([]);
    await add("second@example.com", "root", "2026-10-02T10:00:00Z");
    await add("first@example.com", "root", "2026-10-01T10:00:00Z");
    await add("mod@example.com", "moderator", "2026-09-30T10:00:00Z");
    expect((await repo.listRoots()).map((r) => r.email)).toEqual([
      "first@example.com",
      "second@example.com",
    ]);
    expect(await repo.findFirstRoot()).toMatchObject({ email: "first@example.com" });
  });

  it("counts only roots that aren't disabled", async () => {
    expect(await repo.countActiveRoots()).toBe(0);
    const a = await add("a@example.com", "root", "2026-10-01T10:00:00Z");
    await add("b@example.com", "root", "2026-10-01T11:00:00Z");
    await add("u@example.com", "user", "2026-10-01T12:00:00Z");
    expect(await repo.countActiveRoots()).toBe(2);
    await repo.disableUser(a, new Date());
    expect(await repo.countActiveRoots()).toBe(1);
  });

  it("lockRoots holds the root rows until the transaction ends", async () => {
    const a = await add("a@example.com", "root", "2026-10-01T10:00:00Z");
    const b = await add("b@example.com", "root", "2026-10-01T11:00:00Z");
    const order: string[] = [];
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });

    const first = repo.transaction(async (trx) => {
      await trx.lockRoots(a);
      locked();
      await held;
      await trx.setRole(b, "user", new Date());
      order.push("first");
    });
    await isLocked;
    const second = repo.transaction(async (trx) => {
      await trx.lockRoots(b);
      order.push("second");
      return trx.countActiveRoots();
    });
    // SQLite runs one transaction at a time, so there the second only starts after the first.
    setTimeout(release, 50);
    const [, count] = await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
    // The second saw the first's change once it got the lock (READ COMMITTED).
    expect(count).toBe(1);
  });
});

describe("lastSignIns (123)", () => {
  const event = (actorId: string, action: AuditAction, at: string) =>
    repo.recordAudit(
      { actorId, action, target: { type: "session", id: "s" }, metadata: {} },
      new Date(at),
    );

  it("gives the latest auth.signed_in of each user, in one read", async () => {
    const a = await add("a@example.com", "user", "2026-10-01T10:00:00Z");
    const b = await add("b@example.com", "user", "2026-10-01T11:00:00Z");
    const c = await add("c@example.com", "user", "2026-10-01T12:00:00Z");
    await event(a, "auth.signed_in", "2026-10-02T10:00:00Z");
    await event(a, "auth.signed_in", "2026-10-04T10:00:00Z");
    await event(a, "auth.signed_in", "2026-10-03T10:00:00Z");
    await event(b, "auth.signed_in", "2026-10-05T10:00:00Z");
    // Not a sign-in, so they don't count; c never signed in.
    await event(a, "auth.sso_signed_in", "2026-10-09T10:00:00Z");
    await event(c, "user.disabled", "2026-10-09T10:00:00Z");
    const last = await repo.lastSignIns([a, b, c]);
    expect(last.get(a)).toEqual(new Date("2026-10-04T10:00:00Z"));
    expect(last.get(b)).toEqual(new Date("2026-10-05T10:00:00Z"));
    expect(last.has(c)).toBe(false);
  });

  it("answers only for the ids asked, and for none", async () => {
    const a = await add("a@example.com", "user", "2026-10-01T10:00:00Z");
    const b = await add("b@example.com", "user", "2026-10-01T11:00:00Z");
    await event(a, "auth.signed_in", "2026-10-02T10:00:00Z");
    await event(b, "auth.signed_in", "2026-10-02T10:00:00Z");
    expect([...(await repo.lastSignIns([a])).keys()]).toEqual([a]);
    expect((await repo.lastSignIns([])).size).toBe(0);
  });
});

describe("findUserDetail (123)", () => {
  it("finds a user with their roles and two-factor as the list shows them, or null", async () => {
    const id = await add("m@example.com", "moderator", "2026-10-01T10:00:00Z");
    expect(await repo.findUserDetail(id)).toMatchObject({
      email: "m@example.com",
      twoFactor: false,
      workspaces: [{ name: "global", role: "moderator" }],
    });
    expect(await repo.findUserDetail("nobody")).toBeNull();
  });
});
