import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
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
