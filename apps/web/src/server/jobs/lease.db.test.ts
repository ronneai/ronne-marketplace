import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../db/create-db";
import { fromDbDate } from "../db/dates";
import { migrateToLatest } from "../db/migrate";
import type { Database } from "../db/schema";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import type { DatabaseDialect } from "../db/url";
import { claimLease, LEASE_MS, releaseLease, renewLease } from "./lease";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// The lease is about two processes against one database, so each test has two connections to the
// same database: on a server, a second pool to the test database; on SQLite, a file both open
// (the default in-memory database is one connection's own).
let t: TestDb;
let a: Kysely<Database>;
let b: Kysely<Database>;
let dialect: DatabaseDialect;
let dir: string | null = null;
const NOW = new Date("2026-10-18T12:00:00.000Z");
const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000);

beforeEach(async () => {
  t = await createTestDb();
  dialect = t.dialect;
  if (dialect === "sqlite") {
    dir = mkdtempSync(join(tmpdir(), "ronne-lease-"));
    const url = `file:${join(dir, "jobs.db")}`;
    a = createDb(url).db as Kysely<Database>;
    await migrateToLatest(a, dialect);
    b = createDb(url).db as Kysely<Database>;
  } else {
    a = t.db;
    b = createDb(t.url).db as Kysely<Database>;
  }
});
afterEach(async () => {
  if (dialect === "sqlite") await a.destroy();
  await b.destroy();
  await t.cleanup();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

const row = () =>
  a
    .selectFrom("jobs")
    .select(["lease_holder", "lease_ends_at", "last_run_at", "last_result"])
    .where("name", "=", "retention_purge")
    .executeTakeFirstOrThrow();

describe("a job's lease (102)", () => {
  it("is taken by exactly one of two claimants at once, and by the other once released", async () => {
    const claims = await Promise.all([
      claimLease(a, dialect, "retention_purge", "holder-a", NOW),
      claimLease(b, dialect, "retention_purge", "holder-b", NOW),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const winner = claims[0] ? "holder-a" : "holder-b";
    const loser = claims[0] ? "holder-b" : "holder-a";
    expect((await row()).lease_holder).toBe(winner);
    expect(fromDbDate((await row()).lease_ends_at)).toEqual(new Date(NOW.getTime() + LEASE_MS));
    // The loser can't take it while it's held, and neither can a repeat by the winner.
    expect(await claimLease(b, dialect, "retention_purge", loser, minutes(1))).toBe(false);
    expect(await claimLease(a, dialect, "retention_purge", winner, minutes(1))).toBe(false);
    await releaseLease(a, dialect, "retention_purge", winner, NOW, '{"status":"ok"}');
    expect(await row()).toMatchObject({ lease_holder: null, lease_ends_at: null });
    expect(await claimLease(b, dialect, "retention_purge", loser, minutes(1))).toBe(true);
  });

  it("is taken over once it has ended, and the old holder can't renew it", async () => {
    expect(await claimLease(a, dialect, "retention_purge", "old", NOW)).toBe(true);
    // One second inside the lease: still held.
    expect(await claimLease(b, dialect, "retention_purge", "new", minutes(15))).toBe(false);
    expect(
      await claimLease(
        b,
        dialect,
        "retention_purge",
        "new",
        new Date(NOW.getTime() + LEASE_MS + 1),
      ),
    ).toBe(true);
    expect(await renewLease(a, dialect, "retention_purge", "old", minutes(16))).toBe(false);
    expect((await row()).lease_holder).toBe("new");
    // The old run's release records nothing: the row is the new run's.
    await releaseLease(a, dialect, "retention_purge", "old", NOW, '{"status":"ok"}');
    expect((await row()).lease_holder).toBe("new");
    expect((await row()).last_result).toBeNull();
  });

  it("is kept by renewing it batch by batch", async () => {
    expect(await claimLease(a, dialect, "retention_purge", "worker", NOW)).toBe(true);
    expect(await renewLease(a, dialect, "retention_purge", "worker", minutes(10))).toBe(true);
    // 16 minutes after the claim it would have ended; the renewal moved its end to 25.
    expect(await claimLease(b, dialect, "retention_purge", "other", minutes(16))).toBe(false);
    expect(await claimLease(b, dialect, "retention_purge", "other", minutes(26))).toBe(true);
  });

  it("records the run on release", async () => {
    await claimLease(a, dialect, "retention_purge", "worker", NOW);
    await releaseLease(a, dialect, "retention_purge", "worker", NOW, '{"status":"ok","ms":3}');
    const r = await row();
    expect(fromDbDate(r.last_run_at)).toEqual(NOW);
    expect(r.last_result).toBe('{"status":"ok","ms":3}');
    expect(r.lease_holder).toBeNull();
  });
});
