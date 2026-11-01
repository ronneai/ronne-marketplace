import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../db/dates";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { seedUser } from "../domains/shelves/repositories/test-seed";
import { runUpdateCheckJob } from "../jobs/update-check-job";
import { runUpdateCheck, UPDATE_KEYS } from "./update-check";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const AT = new Date("2026-11-01T10:00:00Z");
const answer = (tag: string) => async () => new Response(JSON.stringify({ tag_name: tag }));
const makeRoot = (id: string) =>
  t.db.updateTable("user").set({ role: "root" }).where("id", "=", id).execute();
const notifications = () => t.db.selectFrom("notifications").selectAll().execute();
const stored = async (key: string) =>
  (await kyselySettingsRepository(t.db, t.dialect).get(key))?.value ?? null;
const check = (fetchFn: unknown, extra: { env?: string; current?: string } = {}) =>
  runUpdateCheck({
    db: t.db,
    dialect: t.dialect,
    now: () => AT,
    fetch: fetchFn as never,
    current: extra.current ?? "0.8.2",
    env: extra.env,
  });

describe("the stored upgrade check (140)", () => {
  it("stores the answer and tells each active root once, not others", async () => {
    const [root1, root2, off, gone] = [
      await seedUser(t, "Root1"),
      await seedUser(t, "Root2"),
      await seedUser(t, "Off"),
      await seedUser(t, "Gone"),
    ];
    const plain = await seedUser(t, "Plain");
    for (const id of [root1, root2, off, gone]) await makeRoot(id);
    const when = toDbDate(AT, t.dialect);
    await t.db.updateTable("user").set({ disabled_at: when }).where("id", "=", off).execute();
    await t.db.updateTable("user").set({ erased_at: when }).where("id", "=", gone).execute();

    const outcome = await check(answer("v0.9.0"));
    expect(outcome).toEqual({ status: "checked", latest: "0.9.0", newer: true, notified: 2 });
    const rows = await notifications();
    expect(rows.map((r) => r.user_id).sort()).toEqual([root1, root2].sort());
    expect(rows.map((r) => r.user_id)).not.toContain(plain);
    expect(rows[0]).toMatchObject({
      kind: "instance.update_available",
      actor_id: null,
      subject_type: "instance",
      subject_id: "0.9.0",
    });
    expect(JSON.parse(String(rows[0]?.params))).toEqual({ version: "0.9.0", current: "0.8.2" });
    expect(await stored(UPDATE_KEYS.latest)).toBe("0.9.0");
    expect(await stored(UPDATE_KEYS.url)).toContain("/releases/tag/v0.9.0");
    expect(await stored(UPDATE_KEYS.at)).toBe(AT.toISOString());
    expect(await stored(UPDATE_KEYS.error)).toBe("");
    expect(await stored(UPDATE_KEYS.notified)).toBe("0.9.0");
  });

  it("tells once per version: a second check, and a root added later, hear nothing", async () => {
    await makeRoot(await seedUser(t, "Root1"));
    await check(answer("v0.9.0"));
    await makeRoot(await seedUser(t, "Late"));
    expect(await check(answer("v0.9.0"))).toMatchObject({ notified: 0 });
    expect(await notifications()).toHaveLength(1);
    // The next version is told again.
    expect(await check(answer("v0.10.0"))).toMatchObject({ notified: 2 });
    expect(await notifications()).toHaveLength(3);
  });

  it("tells nobody about an equal or older release, but stores it", async () => {
    await makeRoot(await seedUser(t, "Root1"));
    expect(await check(answer("v0.8.2"))).toMatchObject({ newer: false, notified: 0 });
    expect(await check(answer("v0.8.1"))).toMatchObject({ newer: false, notified: 0 });
    expect(await notifications()).toEqual([]);
    expect(await stored(UPDATE_KEYS.latest)).toBe("0.8.1");
  });

  it("stores a failure's reason, keeps the last good answer and tells nobody", async () => {
    await makeRoot(await seedUser(t, "Root1"));
    await check(answer("v0.9.0"));
    const later = vi.fn(async () => new Response("", { status: 503 }));
    expect(await check(later)).toEqual({ status: "failed", reason: "unreachable" });
    expect(await stored(UPDATE_KEYS.error)).toBe("unreachable");
    expect(await stored(UPDATE_KEYS.latest)).toBe("0.9.0");
    expect(await notifications()).toHaveLength(1);
    const rate = async () => new Response("", { status: 429 });
    expect(await check(rate)).toEqual({ status: "failed", reason: "rate_limited" });
    // A good answer clears the reason again.
    await check(answer("v0.9.0"));
    expect(await stored(UPDATE_KEYS.error)).toBe("");
  });

  it("does not call fetch with the switch off or RONNE_UPDATE_CHECK=off", async () => {
    await makeRoot(await seedUser(t, "Root1"));
    const fetchFn = vi.fn(answer("v0.9.0"));
    for (const env of ["off", "OFF", "0", "false"]) {
      expect(await check(fetchFn, { env })).toEqual({ status: "off", by: "environment" });
    }
    await kyselySettingsRepository(t.db, t.dialect).set(UPDATE_KEYS.enabled, "false", null, AT);
    expect(await check(fetchFn)).toEqual({ status: "off", by: "switch" });
    // The environment wins even when the switch is on.
    await kyselySettingsRepository(t.db, t.dialect).set(UPDATE_KEYS.enabled, "true", null, AT);
    expect(await check(fetchFn, { env: "off" })).toEqual({ status: "off", by: "environment" });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await notifications()).toEqual([]);
    expect(await stored(UPDATE_KEYS.at)).toBeNull();
  });

  it("is a failed check, not a crash, when the running version isn't semver", async () => {
    expect(await check(answer("v0.9.0"), { current: "garbage" })).toEqual({
      status: "failed",
      reason: "bad_answer",
    });
  });
});

describe("the upgrade check job (140)", () => {
  const run = (fetchFn: unknown, env?: string) =>
    runUpdateCheckJob(
      { db: t.db, dialect: t.dialect, now: () => AT },
      { fetch: fetchFn as never, current: "0.8.2", env },
    );

  it("runs under the lease: a second run while one holds it is skipped", async () => {
    await makeRoot(await seedUser(t, "Root1"));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow = async () => {
      await gate;
      return new Response(JSON.stringify({ tag_name: "v0.9.0" }));
    };
    const first = run(slow);
    await new Promise((r) => setTimeout(r, 50));
    const fetchFn = vi.fn(answer("v0.9.0"));
    expect(await run(fetchFn)).toEqual({ status: "skipped", reason: "locked" });
    expect(fetchFn).not.toHaveBeenCalled();
    release();
    expect(await first).toMatchObject({ status: "done", counts: { notified: 1 } });
  });

  it("counts a skip when off and a failure when GitHub can't be reached", async () => {
    const fetchFn = vi.fn(answer("v0.9.0"));
    expect(await run(fetchFn, "off")).toMatchObject({ status: "done", counts: { skipped: 1 } });
    expect(fetchFn).not.toHaveBeenCalled();
    const down = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await run(down)).toMatchObject({ status: "done", counts: { failed: 1, notified: 0 } });
  });
});
