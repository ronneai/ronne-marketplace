import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../db/create-db";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createDatabaseRateLimitStore } from "../../../rate-limit/database-store";
import { createRateLimiter } from "../../../rate-limit/rate-limiter";
import { kyselyChallengeRepository } from "../repositories/kysely-challenge-repository";
import { SIGN_UP_ADDRESS_LIMIT, SIGN_UP_CODE_IP_LIMIT, SIGN_UP_IP_LIMIT } from "./sign-up-guard";

let t: TestDb;
const SECRET = "test-secret-test-secret-test-secret-00";
const NOW = new Date("2026-11-21T12:00:00.000Z");
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

describe("a challenge answer is taken once (190)", () => {
  it("refuses a replay, also when two connections send it at once", async () => {
    const repo = kyselyChallengeRepository(t.db, t.dialect);
    expect(await repo.take("a".repeat(64), NOW)).toBe(true);
    expect(await repo.take("a".repeat(64), NOW)).toBe(false);
    const server = t.url !== "file::memory:";
    const pools = server ? Array.from({ length: 4 }, () => createDb(t.url).db) : [t.db];
    try {
      await Promise.all(
        pools.map((db) => db.selectFrom("challenges_used").select("expires_at").execute()),
      );
      const taken = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          kyselyChallengeRepository(pools[i % pools.length] ?? t.db, t.dialect).take(
            "b".repeat(64),
            NOW,
          ),
        ),
      );
      expect(taken.filter(Boolean)).toHaveLength(1);
    } finally {
      if (server) await Promise.all(pools.map((db) => db.destroy()));
    }
  });
});

describe("the sign-up limits (190), counted in the database", () => {
  const store = () =>
    createDatabaseRateLimitStore(() => ({ db: t.db, dialect: t.dialect, authSecret: SECRET }));
  const limiter = (limit: { name: string; max: number; windowMs: number }) =>
    createRateLimiter({ store: store(), ...limit, now: () => NOW.getTime() });

  it("allows 10 sign-ups an hour from one client IP, then refuses", async () => {
    const ip = limiter(SIGN_UP_IP_LIMIT);
    for (let i = 0; i < 10; i++) expect((await ip.consume(["203.0.113.9"])).allowed).toBe(true);
    expect((await ip.consume(["203.0.113.9"])).allowed).toBe(false);
    expect((await ip.consume(["203.0.113.10"])).allowed).toBe(true);
  });

  it("allows 20 code tries an hour from one client IP, and 10 sign-up requests to one address", async () => {
    const tries = limiter(SIGN_UP_CODE_IP_LIMIT);
    for (let i = 0; i < 20; i++) expect((await tries.consume(["203.0.113.9"])).allowed).toBe(true);
    expect(await tries.consume(["203.0.113.9"])).toMatchObject({ allowed: false });
    const address = limiter(SIGN_UP_ADDRESS_LIMIT);
    for (let i = 0; i < 10; i++)
      expect((await address.consume(["ana@acme.com"])).allowed).toBe(true);
    expect((await address.consume(["ana@acme.com"])).allowed).toBe(false);
  });

  it("counts each limit apart, over an hour", async () => {
    expect(
      new Set([SIGN_UP_IP_LIMIT.name, SIGN_UP_CODE_IP_LIMIT.name, SIGN_UP_ADDRESS_LIMIT.name]).size,
    ).toBe(3);
    for (const limit of [SIGN_UP_IP_LIMIT, SIGN_UP_CODE_IP_LIMIT, SIGN_UP_ADDRESS_LIMIT])
      expect(limit.windowMs, limit.name).toBe(60 * 60_000);
    let clock = NOW.getTime();
    const ip = createRateLimiter({ store: store(), ...SIGN_UP_IP_LIMIT, now: () => clock });
    const tries = createRateLimiter({ store: store(), ...SIGN_UP_CODE_IP_LIMIT, now: () => clock });
    for (let i = 0; i < 10; i++) await ip.consume(["203.0.113.9"]);
    // Sign-ups used up; code tries from the same address still count on their own.
    expect((await tries.consume(["203.0.113.9"])).allowed).toBe(true);
    clock += 59 * 60_000;
    expect((await ip.consume(["203.0.113.9"])).allowed).toBe(false);
    clock += 2 * 60_000;
    expect((await ip.consume(["203.0.113.9"])).allowed).toBe(true);
  });
});
