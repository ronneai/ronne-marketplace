import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../db/create-db";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createDatabaseRateLimitStore } from "../../../rate-limit/database-store";
import { reserveEmailCodeSend } from "./email-code";

// 109's limiter holds the send limits when sends race (190): run on every database.
let t: TestDb;
let clock: Date;
const SECRET = "test-secret-test-secret-test-secret-00";
const storeOn = (db = t.db) =>
  createDatabaseRateLimitStore(() => ({ db, dialect: t.dialect, authSecret: SECRET }));
const reserve = (subjectId: string, email = "ana@acme.example", db = t.db) =>
  reserveEmailCodeSend(storeOn(db), SECRET, { purpose: "sign_up", subjectId, email }, clock);

beforeEach(async () => {
  t = await createTestDb();
  clock = new Date("2026-11-21T12:00:30.000Z");
});
afterEach(() => t.cleanup());

/** Several warm connections on a server; the one test connection on SQLite. */
const connections = async (count: number) => {
  const server = t.url !== "file::memory:";
  const pools = server ? Array.from({ length: count }, () => createDb(t.url).db) : [t.db];
  await Promise.all(pools.map((db) => db.selectFrom("rate_limits").select("key_hash").execute()));
  return { pools, done: () => (server ? Promise.all(pools.map((db) => db.destroy())) : undefined) };
};

describe("reserving an email code's send (190)", () => {
  it("allows one a minute per subject, and says how long to wait", async () => {
    expect(await reserve("01SUBJECTA0000000000000000")).toEqual({ ok: true });
    const again = await reserve("01SUBJECTA0000000000000000");
    expect(again).toMatchObject({ ok: false, reason: "wait" });
    expect((again as { seconds: number }).seconds).toBeLessThanOrEqual(60);
  });

  it("allows 3 an hour per address, whichever subject asks, whatever the case", async () => {
    for (const i of [1, 2, 3])
      expect(
        await reserve(`01SUBJECT${i}0000000000000000`, i === 2 ? " ANA@acme.example" : undefined),
      ).toEqual({
        ok: true,
      });
    expect(await reserve("01SUBJECT40000000000000000")).toEqual({ ok: false, reason: "hourly" });
    expect(await reserve("01SUBJECT50000000000000000", "bea@acme.example")).toEqual({ ok: true });
  });

  it("lets no more than 3 through when sends for one address race", async () => {
    const { pools, done } = await connections(6);
    try {
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          reserve(
            `01RACE${String(i).padStart(20, "0")}`,
            "ana@acme.example",
            pools[i % pools.length],
          ),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(3);
    } finally {
      await done();
    }
  });

  it("lets one through when sends for one subject race", async () => {
    const { pools, done } = await connections(4);
    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          reserve("01SAMESUBJECT0000000000000", `user${i}@acme.example`, pools[i % pools.length]),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
    } finally {
      await done();
    }
  });
});
