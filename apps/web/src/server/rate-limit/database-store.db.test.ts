import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../db/create-db";
import { migrateToLatest } from "../db/migrate";
import { rateLimits } from "../db/migrations/0044_rate_limits";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createDatabaseRateLimitStore } from "./database-store";
import { rateLimitKeyHash } from "./key-hash";
import { createRateLimiter, type RateLimitStore } from "./rate-limiter";
import { storeRules } from "./testing/store-rules";

const SECRET = "a-test-auth-secret-of-enough-length-0123456789";

let t: TestDb;
const others: Db[] = [];
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(async () => {
  for (const db of others.splice(0)) await db.destroy();
  await t.cleanup();
});

const storeOn = (db: Db, authSecret = SECRET): RateLimitStore =>
  createDatabaseRateLimitStore(() => ({ db, dialect: t.dialect, authSecret }));

/**
 * A second connection pool on the same database, as a second replica (or the server after a
 * restart) has. On SQLite it's the same pool: one process serves a SQLite file, and two pools in
 * one process can't run transactions side by side (its driver blocks the process while it waits
 * for the file's lock). Another process waits for the lock instead (db/locks.db.test.ts), and the
 * restart test below opens a real second pool on a file.
 */
const secondPool = (): Db => {
  if (t.dialect === "sqlite") return t.db;
  const { db } = createDb(t.url);
  others.push(db);
  return db;
};

/** A migrated SQLite file and a way to open it, for a test that needs two pools one after the other. */
const sqliteFile = async () => {
  const dir = mkdtempSync(join(tmpdir(), "ronne-rate-limit-"));
  const url = `file:${join(dir, "limits.db")}`;
  const first = createDb(url).db;
  await migrateToLatest(first, "sqlite");
  return {
    first,
    open: () => {
      const { db } = createDb(url);
      others.push(db);
      return db;
    },
    cleanup: async () => {
      await first.destroy();
      rmSync(dir, { recursive: true, force: true });
    },
  };
};

describe("the database store (109)", () => {
  storeRules(async () => storeOn(t.db));

  it("allows exactly the limit when 20 attempts come at once (over two pools, one on SQLite)", async () => {
    const pools = [storeOn(t.db), storeOn(secondPool())];
    const now = () => 1_000_000;
    const attempts = Array.from({ length: 20 }, (_, i) =>
      createRateLimiter({
        store: pools[i % 2] as RateLimitStore,
        name: "sign-in",
        max: 5,
        now,
      }).consume(["email:a@b.c", "ip:203.0.113.9"]),
    );
    const decisions = await Promise.all(attempts);
    expect(decisions.filter((d) => d.allowed)).toHaveLength(5);
    const rows = await t.db.selectFrom("rate_limits").select("hits").execute();
    expect(rows.map((r) => Number(r.hits))).toEqual([5, 5]);
  });

  it("keeps the count for a new pool: a restart or another replica sees it", async () => {
    const now = () => 1_000_000;
    const file = t.dialect === "sqlite" ? await sqliteFile() : null;
    try {
      const firstDb = file ? file.first : t.db;
      const first = createRateLimiter({ store: storeOn(firstDb), name: "sign-in", max: 2, now });
      await first.consume(["email:a@b.c"]);
      await first.consume(["email:a@b.c"]);
      const nextDb = file ? file.open() : secondPool();
      expect(nextDb).not.toBe(firstDb);
      const second = createRateLimiter({ store: storeOn(nextDb), name: "sign-in", max: 2, now });
      expect(await second.consume(["email:a@b.c"])).toEqual({
        allowed: false,
        retryAfterSeconds: 60,
      });
    } finally {
      for (const db of others.splice(0)) await db.destroy();
      await file?.cleanup();
    }
  });

  it("stores no email, address or ID, and one row per limit and key", async () => {
    const store = storeOn(t.db);
    const now = () => 1_000_000;
    const keys = ["email:person@example.com", "ip:203.0.113.9", "user:01JABCDEFGHJKMNPQRSTVWXYZ0"];
    await createRateLimiter({ store, name: "a", now }).consume(keys);
    await createRateLimiter({ store, name: "b", now }).consume(keys);
    const rows = await t.db.selectFrom("rate_limits").selectAll().execute();
    expect(rows).toHaveLength(6);
    const text = JSON.stringify(rows);
    for (const part of ["person", "example.com", "203.0.113", "01JABCDEFGH"])
      expect(text).not.toContain(part);
    for (const row of rows) expect(row.key_hash).toMatch(/^[0-9a-f]{64}$/);
    const limit = { name: "a", max: 5, windowMs: 60_000 };
    expect(rows.map((r) => r.key_hash)).toContain(
      rateLimitKeyHash(SECRET, { limit, key: "ip:203.0.113.9" }),
    );
  });

  it("counts from zero under another AUTH_SECRET (rotate-secret)", async () => {
    const now = () => 1_000_000;
    const before = createRateLimiter({ store: storeOn(t.db), name: "s", max: 1, now });
    await before.consume(["k"]);
    expect((await before.consume(["k"])).allowed).toBe(false);
    const after = createRateLimiter({
      store: storeOn(t.db, `${SECRET}-rotated`),
      name: "s",
      max: 1,
      now,
    });
    expect((await after.consume(["k"])).allowed).toBe(true);
  });

  it("makes a row again when the purge deleted it between attempts", async () => {
    const now = { t: 1_000_000 };
    const limiter = createRateLimiter({
      store: storeOn(t.db),
      name: "s",
      max: 1,
      now: () => now.t,
    });
    await limiter.consume(["k"]);
    await t.db.deleteFrom("rate_limits").execute();
    now.t += 1_000;
    expect((await limiter.consume(["k"])).allowed).toBe(true);
    expect((await limiter.consume(["k"])).allowed).toBe(false);
  });

  it("lets the error through when the database fails: nothing passes uncounted", async () => {
    // A database the counters can't be written to: not migrated, so there's no table.
    const empty = await createTestDb({ migrate: false });
    try {
      const store = createDatabaseRateLimitStore(() => ({
        db: empty.db,
        dialect: empty.dialect,
        authSecret: SECRET,
      }));
      const limiter = createRateLimiter({ store, name: "s" });
      await expect(limiter.consume(["k"])).rejects.toThrow();
      await expect(limiter.check(["k"])).rejects.toThrow();
      await expect(limiter.record(["k"])).rejects.toThrow();
    } finally {
      await empty.cleanup();
    }
  });

  it("is a migration safe to run again", async () => {
    await createRateLimiter({ store: storeOn(t.db), name: "s" }).consume(["k"]);
    await rateLimits(t.dialect).up(t.db as never);
    expect(await t.db.selectFrom("rate_limits").selectAll().execute()).toHaveLength(1);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
