import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { setLoggerForTests } from "../log";
import { claimLease, LEASE_MS } from "./lease";
import { RETENTION_JOB, runRetentionJob } from "./retention-job";
import { type JobDeps, jobStatus, LeaseLostError, runJob } from "./run-job";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let deps: JobDeps;
let lines: Record<string, unknown>[];
const NOW = new Date("2026-10-18T12:00:00.000Z");

beforeEach(async () => {
  t = await createTestDb();
  deps = { db: t.db, dialect: t.dialect, now: () => NOW };
  lines = [];
  setLoggerForTests({
    level: "debug",
    format: "json",
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
});
afterEach(async () => {
  setLoggerForTests();
  await t.cleanup();
});

const events = (name: string) => lines.filter((l) => l.event === name);

describe("a scheduled job's run (102)", () => {
  it("runs the work under the lease, logs its start and end with the counts, and records the run", async () => {
    let renewals = 0;
    const run = await runJob(deps, "retention_purge", async (renew) => {
      await renew();
      renewals++;
      return { ipsCleared: 3, emailsCleared: 0, sessionsDeleted: 1, grantsDeleted: 0 };
    });
    expect(run).toMatchObject({ status: "done", counts: { ipsCleared: 3, sessionsDeleted: 1 } });
    expect(renewals).toBe(1);
    expect(events("job.started")).toMatchObject([{ job: "retention_purge", domain: "jobs" }]);
    expect(events("job.finished")).toMatchObject([
      {
        job: "retention_purge",
        ipsCleared: 3,
        emailsCleared: 0,
        sessionsDeleted: 1,
        grantsDeleted: 0,
      },
    ]);
    expect(typeof events("job.finished")[0]?.ms).toBe("number");
    const status = await jobStatus(deps, "retention_purge");
    expect(status.lastRunAt).toEqual(NOW);
    expect(status.lastResult).toMatchObject({
      at: NOW.toISOString(),
      status: "ok",
      counts: { ipsCleared: 3, emailsCleared: 0, sessionsDeleted: 1, grantsDeleted: 0 },
    });
    expect(status.running).toBe(false);
  });

  it("is skipped while another run holds the lease, and says so at debug", async () => {
    expect(await claimLease(t.db, t.dialect, "retention_purge", "another", NOW)).toBe(true);
    let worked = false;
    const run = await runJob(deps, "retention_purge", async () => {
      worked = true;
      return {};
    });
    expect(run).toEqual({ status: "skipped", reason: "locked" });
    expect(worked).toBe(false);
    expect(events("job.skipped")).toMatchObject([
      { job: "retention_purge", reason: "locked", level: "debug" },
    ]);
    expect(events("job.started")).toEqual([]);
    expect((await jobStatus(deps, "retention_purge")).running).toBe(true);
  });

  it("logs a failure with the error, records only its name, and releases the lease", async () => {
    const run = await runJob(deps, "retention_purge", async () => {
      throw new Error("connect ECONNREFUSED db.internal:5432");
    });
    expect(run).toMatchObject({ status: "failed" });
    const [failed] = events("job.failed");
    expect(failed).toMatchObject({ job: "retention_purge", level: "error" });
    expect((failed?.err as { message?: string })?.message).toContain("ECONNREFUSED");
    const status = await jobStatus(deps, "retention_purge");
    expect(status.lastResult).toMatchObject({ status: "failed", error: "Error" });
    expect(JSON.stringify(status.lastResult)).not.toContain("db.internal");
    expect(status.running).toBe(false);
    // The next run isn't blocked by the failure.
    expect((await runJob(deps, "retention_purge", async () => ({ ipsCleared: 0 }))).status).toBe(
      "done",
    );
  });

  it("doesn't throw when the database fails as the run ends: the lease stays and expires", async () => {
    // A connection that works until the release's UPDATE, as a database going away would.
    let failing = false;
    const db = new Proxy(t.db, {
      get: (target, key, receiver) => {
        if (key === "updateTable" && failing) throw new Error("connection lost");
        const value = Reflect.get(target, key, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const run = await runJob({ ...deps, db }, "retention_purge", async () => {
      failing = true;
      return { ipsCleared: 1 };
    });
    expect(run).toMatchObject({ status: "failed" });
    expect(events("job.failed")).toHaveLength(1);
    failing = false;
    const status = await jobStatus(deps, "retention_purge");
    expect(status).toMatchObject({ running: true, lastResult: null, lastRunAt: null });
    // The lease expires on its own: a claim past it succeeds.
    expect(
      await claimLease(
        t.db,
        t.dialect,
        "retention_purge",
        "next",
        new Date(NOW.getTime() + LEASE_MS + 1),
      ),
    ).toBe(true);
  });

  it("stops the work when its lease went to another run, which keeps the row", async () => {
    let clock = NOW;
    deps = { ...deps, now: () => clock };
    const run = await runJob(deps, "retention_purge", async (renew) => {
      // The lease has ended and another run took it over.
      clock = new Date(NOW.getTime() + 16 * 60 * 1000);
      expect(await claimLease(t.db, t.dialect, "retention_purge", "taker", clock)).toBe(true);
      await renew();
      throw new Error("not reached");
    });
    expect(run).toMatchObject({ status: "failed", error: expect.any(LeaseLostError) });
    const row = await t.db
      .selectFrom("jobs")
      .select(["lease_holder", "last_result"])
      .where("name", "=", "retention_purge")
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ lease_holder: "taker", last_result: null });
  });

  it("runs the retention purge by root's policy, under its own name", async () => {
    await t.db
      .insertInto("audit_log")
      .values({
        id: newId(),
        actor_id: null,
        action: "auth.signed_in",
        target_type: "none",
        target_id: null,
        metadata: "{}",
        ip_address: "203.0.113.7",
        created_at: toDbDate(new Date("2026-01-01T00:00:00.000Z"), t.dialect),
      })
      .execute();
    const run = await runRetentionJob(deps);
    expect(run).toMatchObject({
      status: "done",
      counts: { ipsCleared: 1, emailsCleared: 0, sessionsDeleted: 0, grantsDeleted: 0 },
    });
    expect(events("job.finished")).toMatchObject([{ job: RETENTION_JOB, ipsCleared: 1 }]);
    expect(JSON.stringify(lines)).not.toContain("203.0.113.7");
    expect((await jobStatus(deps, RETENTION_JOB)).lastResult).toMatchObject({
      status: "ok",
      counts: { ipsCleared: 1 },
    });
  });
});
