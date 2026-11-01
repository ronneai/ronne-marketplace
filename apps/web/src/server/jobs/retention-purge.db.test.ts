import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { decodeJson } from "../db/json";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { PURGE_BATCH, purgeCutoffs, runRetentionPurge } from "./retention-purge";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
const NOW = new Date("2026-10-18T12:00:00.000Z");
const POLICY = { ipDays: 90, sessionsDays: 30, feedbackDays: 365 };
// Written out, not derived from `purgeCutoffs`, so a cutoff that drifts from T − days would show.
const IP_CUTOFF = new Date("2026-07-20T12:00:00.000Z");
const SESSIONS_CUTOFF = new Date("2026-09-18T12:00:00.000Z");
const FEEDBACK_CUTOFF = new Date("2025-10-18T12:00:00.000Z");
// Notifications are kept a fixed 90 days (139), whatever root's policy says.
const NOTIFICATION_CUTOFF = new Date("2026-07-20T12:00:00.000Z");
const second = (date: Date, n: number) => new Date(date.getTime() + n * 1000);
/** One second inside the retention (kept) and one second past it (purged). */
const INSIDE_IP = second(IP_CUTOFF, 1);
const OUTSIDE_IP = second(IP_CUTOFF, -1);
const INSIDE_SESSIONS = second(SESSIONS_CUTOFF, 1);
const OUTSIDE_SESSIONS = second(SESSIONS_CUTOFF, -1);

let userId: string;

beforeEach(async () => {
  t = await createTestDb();
  userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Ana",
      email: "ana@example.com",
      email_verified: t.dialect === "sqlite" ? 1 : true,
      image: null,
      created_at: toDbDate(NOW, t.dialect),
      updated_at: toDbDate(NOW, t.dialect),
    })
    .execute();
});
afterEach(() => t.cleanup());

const at = (date: Date) => toDbDate(date, t.dialect);

const auditEvent = async (
  createdAt: Date,
  fields: {
    action?: string;
    ip?: string | null;
    metadata?: Record<string, unknown>;
    /** A chosen id, for a test about the order of ids. */
    id?: string;
  } = {},
) => {
  const id = fields.id ?? newId();
  await t.db
    .insertInto("audit_log")
    .values({
      id,
      actor_id: null,
      action: fields.action ?? "auth.signed_in",
      target_type: "none",
      target_id: null,
      metadata: JSON.stringify(fields.metadata ?? {}),
      ip_address: fields.ip === undefined ? "203.0.113.7" : fields.ip,
      created_at: at(createdAt),
    })
    .execute();
  return id;
};

const session = async (createdAt: Date, expiresAt: Date, ip: string | null = "203.0.113.7") => {
  const id = newId();
  await t.db
    .insertInto("session")
    .values({
      id,
      token: newId(),
      user_id: userId,
      ip_address: ip,
      user_agent: ip === null ? null : "Mozilla/5.0",
      created_at: at(createdAt),
      updated_at: at(createdAt),
      expires_at: at(expiresAt),
    })
    .execute();
  return id;
};

const grant = async (
  createdAt: Date,
  status: string,
  fields: { expiresAt?: Date; ip?: string | null } = {},
) => {
  const id = newId();
  await t.db
    .insertInto("device_grants")
    .values({
      id,
      device_code_hash: newId() + newId(),
      user_code: id.slice(-8).toUpperCase(),
      client_id: "rmk",
      name: "laptop",
      status,
      user_id: status === "pending" ? null : userId,
      requester_ip: fields.ip === undefined ? "203.0.113.7" : fields.ip,
      approver_ip: fields.ip === undefined ? "198.51.100.9" : fields.ip,
      interval_seconds: 5,
      last_polled_at: null,
      decided_at: null,
      created_at: at(createdAt),
      expires_at: at(fields.expiresAt ?? second(createdAt, 600)),
    })
    .execute();
  return id;
};

const auditRow = (id: string) =>
  t.db
    .selectFrom("audit_log")
    .select(["ip_address", "metadata"])
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
const sessionRow = (id: string) =>
  t.db
    .selectFrom("session")
    .select(["ip_address", "user_agent"])
    .where("id", "=", id)
    .executeTakeFirst();
const grantRow = (id: string) =>
  t.db
    .selectFrom("device_grants")
    .select(["requester_ip", "approver_ip", "status"])
    .where("id", "=", id)
    .executeTakeFirst();

describe("the retention purge (102)", () => {
  it("counts the cutoffs from the moment of the run", () => {
    expect(purgeCutoffs(POLICY, NOW)).toEqual({
      ip: IP_CUTOFF,
      sessions: SESSIONS_CUTOFF,
      feedback: FEEDBACK_CUTOFF,
      notifications: NOTIFICATION_CUTOFF,
    });
  });

  it("clears and deletes exactly what is past each boundary, and nothing else", async () => {
    // The audit log: the IP goes at the IP retention; the event stays. A row exactly at the
    // cutoff is inside it (strictly older goes).
    const oldEvent = await auditEvent(OUTSIDE_IP);
    const newEvent = await auditEvent(INSIDE_IP);
    const atEvent = await auditEvent(IP_CUTOFF);
    const oldNoIp = await auditEvent(OUTSIDE_IP, { ip: null });
    // Failed sign-ins: the typed email goes with the IP; the reason stays. Another action's
    // `email` (a user.created) stays whatever its age.
    const oldFailed = await auditEvent(OUTSIDE_IP, {
      action: "auth.sign_in_failed",
      metadata: { email: "typo@example.com", reason: "invalid" },
    });
    const newFailed = await auditEvent(INSIDE_IP, {
      action: "auth.sign_in_failed",
      metadata: { email: "typo@example.com", reason: "invalid" },
    });
    const atFailed = await auditEvent(IP_CUTOFF, {
      action: "auth.sign_in_failed",
      metadata: { email: "typo@example.com", reason: "invalid" },
    });
    const oldCreated = await auditEvent(OUTSIDE_IP, {
      action: "user.created",
      metadata: { email: "ana@example.com", role: "user" },
    });
    // Sessions: the IP and user agent go at the IP retention, live or not; the row goes once it
    // expired before the sessions retention.
    const oldLive = await session(OUTSIDE_IP, second(NOW, 3600));
    const newLive = await session(INSIDE_IP, second(NOW, 3600));
    const expiredOld = await session(OUTSIDE_IP, OUTSIDE_SESSIONS);
    const expiredRecent = await session(INSIDE_IP, INSIDE_SESSIONS);
    const atBoth = await session(IP_CUTOFF, SESSIONS_CUTOFF);
    // Device grants: the IPs at the IP retention; the row at the sessions retention once finished.
    const spentOld = await grant(OUTSIDE_SESSIONS, "spent");
    const spentRecent = await grant(INSIDE_SESSIONS, "spent");
    const spentAt = await grant(SESSIONS_CUTOFF, "spent");
    const pendingOldExpiringNow = await grant(OUTSIDE_SESSIONS, "pending", { expiresAt: NOW });
    const pendingOld = await grant(OUTSIDE_SESSIONS, "pending");
    const pendingOldStillValid = await grant(OUTSIDE_SESSIONS, "pending", {
      expiresAt: second(NOW, 600),
    });
    // Pending and still valid, so only the IP rule touches them (a finished one that old would go).
    const pendingIpOld = await grant(OUTSIDE_IP, "pending", { expiresAt: second(NOW, 600) });
    const pendingIpRecent = await grant(INSIDE_IP, "pending", { expiresAt: second(NOW, 600) });
    const pendingIpAt = await grant(IP_CUTOFF, "pending", { expiresAt: second(NOW, 600) });

    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW);

    expect(counts).toEqual({
      ipsCleared: { auditLog: 3, sessions: 2, deviceGrants: 1 },
      emailsCleared: 1,
      sessionsDeleted: 1,
      grantsDeleted: 2,
      feedbackDeleted: 0,
      notificationsDeleted: 0,
    });
    expect((await auditRow(oldEvent)).ip_address).toBeNull();
    expect((await auditRow(newEvent)).ip_address).toBe("203.0.113.7");
    expect((await auditRow(atEvent)).ip_address).toBe("203.0.113.7");
    expect(decodeJson((await auditRow(atFailed)).metadata)).toHaveProperty("email");
    expect((await auditRow(oldNoIp)).ip_address).toBeNull();
    expect(decodeJson((await auditRow(oldFailed)).metadata)).toEqual({ reason: "invalid" });
    expect(decodeJson((await auditRow(newFailed)).metadata)).toEqual({
      email: "typo@example.com",
      reason: "invalid",
    });
    expect(decodeJson((await auditRow(oldCreated)).metadata)).toEqual({
      email: "ana@example.com",
      role: "user",
    });
    expect(await sessionRow(oldLive)).toEqual({ ip_address: null, user_agent: null });
    expect(await sessionRow(newLive)).toEqual({
      ip_address: "203.0.113.7",
      user_agent: "Mozilla/5.0",
    });
    expect(await sessionRow(expiredOld)).toBeUndefined();
    expect(await sessionRow(atBoth)).toEqual({
      ip_address: "203.0.113.7",
      user_agent: "Mozilla/5.0",
    });
    expect(await sessionRow(expiredRecent)).toEqual({
      ip_address: "203.0.113.7",
      user_agent: "Mozilla/5.0",
    });
    expect(await grantRow(spentOld)).toBeUndefined();
    expect(await grantRow(pendingOld)).toBeUndefined();
    expect((await grantRow(spentRecent))?.requester_ip).toBe("203.0.113.7");
    expect((await grantRow(pendingOldStillValid))?.status).toBe("pending");
    expect((await grantRow(pendingOldExpiringNow))?.status).toBe("pending");
    expect((await grantRow(spentAt))?.status).toBe("spent");
    expect((await grantRow(pendingIpAt))?.requester_ip).toBe("203.0.113.7");
    expect(await grantRow(pendingIpOld)).toEqual({
      requester_ip: null,
      approver_ip: null,
      status: "pending",
    });
    expect(await grantRow(pendingIpRecent)).toEqual({
      requester_ip: "203.0.113.7",
      approver_ip: "198.51.100.9",
      status: "pending",
    });
    // The user row and the events are untouched.
    expect(await t.db.selectFrom("user").select("id").execute()).toHaveLength(1);
    expect(await t.db.selectFrom("audit_log").select("id").execute()).toHaveLength(8);

    // Idempotent: a second run at the same moment changes nothing.
    expect(await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).toEqual({
      ipsCleared: { auditLog: 0, sessions: 0, deviceGrants: 0 },
      emailsCleared: 0,
      sessionsDeleted: 0,
      grantsDeleted: 0,
      feedbackDeleted: 0,
      notificationsDeleted: 0,
    });
  });

  it("counts the same in a dry run and changes nothing", async () => {
    const event = await auditEvent(OUTSIDE_IP);
    const failed = await auditEvent(OUTSIDE_IP, {
      action: "auth.sign_in_failed",
      metadata: { email: "typo@example.com", reason: "invalid" },
    });
    const old = await session(OUTSIDE_IP, OUTSIDE_SESSIONS);
    const spent = await grant(OUTSIDE_SESSIONS, "spent");
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      dryRun: true,
      // A dry run counts: no batch to report, for any rule.
      onBatch: () => {
        throw new Error("called in a dry run");
      },
    });
    expect(counts).toEqual({
      ipsCleared: { auditLog: 2, sessions: 1, deviceGrants: 0 },
      emailsCleared: 1,
      sessionsDeleted: 1,
      grantsDeleted: 1,
      feedbackDeleted: 0,
      notificationsDeleted: 0,
    });
    expect((await auditRow(event)).ip_address).toBe("203.0.113.7");
    expect(decodeJson((await auditRow(failed)).metadata)).toHaveProperty("email");
    expect(await sessionRow(old)).toEqual({ ip_address: "203.0.113.7", user_agent: "Mozilla/5.0" });
    expect((await grantRow(spent))?.requester_ip).toBe("203.0.113.7");
    expect(await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).toEqual(counts);
  });

  it("works in batches of 1,000, the oldest first, and a run stopped after one batch leaves the rest for the next", async () => {
    const total = PURGE_BATCH + 5;
    const ids: string[] = [];
    for (let i = 0; i < total; i++) ids.push(await auditEvent(second(OUTSIDE_IP, -i)));
    const stop = new Error("stopped");
    let batches = 0;
    await expect(
      runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
        onBatch: () => {
          batches++;
          throw stop;
        },
      }),
    ).rejects.toBe(stop);
    expect(batches).toBe(1);
    const left = await t.db
      .selectFrom("audit_log")
      .select("id")
      .where("ip_address", "is not", null)
      .execute();
    expect(left).toHaveLength(5);
    // The newest five are what's left: the oldest went first.
    expect(left.map((r) => r.id).sort()).toEqual(ids.slice(0, 5).sort());

    const seen: number[] = [];
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      onBatch: (done) => {
        seen.push(done);
      },
    });
    expect(counts.ipsCleared.auditLog).toBe(5);
    expect(seen).toEqual([5]);
    expect(
      await t.db.selectFrom("audit_log").select("id").where("ip_address", "is not", null).execute(),
    ).toHaveLength(0);
  });

  it("reports the run's rows so far across the rules, not each rule's own count", async () => {
    // 1,005 audit IPs (two batches), then one failed sign-in's email, then one expired session.
    for (let i = 0; i < PURGE_BATCH + 5; i++) await auditEvent(second(OUTSIDE_IP, -i));
    await auditEvent(OUTSIDE_IP, {
      action: "auth.sign_in_failed",
      ip: null,
      metadata: { email: "typo@example.com", reason: "invalid" },
    });
    await session(OUTSIDE_IP, OUTSIDE_SESSIONS, null);
    const seen: number[] = [];
    await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      onBatch: (done) => {
        seen.push(done);
      },
    });
    expect(seen).toEqual([PURGE_BATCH, PURGE_BATCH + 5, PURGE_BATCH + 6, PURGE_BATCH + 7]);
  });

  it("leaves a failed sign-in whose metadata only looks like it has an email", async () => {
    const nested = await auditEvent(OUTSIDE_IP, {
      action: "auth.sign_in_failed",
      metadata: { reason: "invalid", detail: { email: "x" } },
    });
    const plain = await auditEvent(OUTSIDE_IP, {
      action: "auth.sign_in_failed",
      metadata: { email: "a@example.com", reason: "invalid" },
    });
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW);
    expect(counts.emailsCleared).toBe(1);
    expect(decodeJson((await auditRow(nested)).metadata)).toEqual({
      reason: "invalid",
      detail: { email: "x" },
    });
    expect(decodeJson((await auditRow(plain)).metadata)).toEqual({ reason: "invalid" });
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).emailsCleared).toBe(0);
  });

  it("clears every real email behind a full page of look-alikes, and a dry run counts only the real ones", async () => {
    // 1,000 rows the LIKE matches without a top-level `email`, all older than five real ones.
    for (let i = 0; i < PURGE_BATCH; i++)
      await auditEvent(second(OUTSIDE_IP, -10_000 - i), {
        action: "auth.sign_in_failed",
        ip: null,
        metadata: { reason: "invalid", detail: { email: "x" } },
      });
    const real: string[] = [];
    for (let i = 0; i < 5; i++)
      real.push(
        await auditEvent(second(OUTSIDE_IP, -i), {
          action: "auth.sign_in_failed",
          ip: null,
          metadata: { email: `typo${i}@example.com`, reason: "invalid" },
        }),
      );
    const dry = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, { dryRun: true });
    expect(dry.emailsCleared).toBe(5);
    for (const id of real)
      expect(decodeJson((await auditRow(id)).metadata)).toHaveProperty("email");
    const seen: number[] = [];
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      onBatch: (done) => {
        seen.push(done);
      },
    });
    expect(counts.emailsCleared).toBe(5);
    for (const id of real)
      expect(decodeJson((await auditRow(id)).metadata)).toEqual({ reason: "invalid" });
    // The look-alikes filled the first page (no change, no call) and the five came on the second.
    expect(seen).toEqual([5]);
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).emailsCleared).toBe(0);
  });

  it("walks a page boundary inside one created_at by id, skipping and repeating nothing", {
    timeout: 60_000,
  }, async () => {
    // 1,005 failed sign-ins in the same second, ids in a known order; the real emails sit at the
    // first, the middle, both sides of the page boundary (999 and 1000) and the last position.
    // Without the id tie-break the rows after the boundary are skipped; with `>=` on created_at
    // the same full page would be read again, which the rule refuses (the timeout is a backstop).
    const real = new Set([0, 500, 999, 1000, 1004]);
    const ids: string[] = [];
    for (let i = 0; i < PURGE_BATCH + 5; i++) {
      const id = `0SAME${String(i).padStart(21, "0")}`;
      ids.push(id);
      await auditEvent(OUTSIDE_IP, {
        id,
        action: "auth.sign_in_failed",
        ip: null,
        metadata: real.has(i)
          ? { email: `typo${i}@example.com`, reason: "invalid" }
          : { reason: "invalid", detail: { email: "x" } },
      });
    }
    expect(
      (await runRetentionPurge(t.db, t.dialect, POLICY, NOW, { dryRun: true })).emailsCleared,
    ).toBe(5);
    const seen: number[] = [];
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      onBatch: (done) => {
        seen.push(done);
      },
    });
    expect(counts.emailsCleared).toBe(5);
    // Three on the first page (0, 500, 999), two on the second (1000, 1004).
    expect(seen).toEqual([3, 5]);
    for (const i of real)
      expect(decodeJson((await auditRow(ids[i] as string)).metadata)).toEqual({
        reason: "invalid",
      });
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).emailsCleared).toBe(0);
  });
});

describe("handled feedback (127)", () => {
  const feedback = async (
    status: "new" | "handled",
    handledAt: Date | null,
    sentAt: Date = new Date("2024-01-01T00:00:00Z"),
  ) => {
    const id = newId();
    await t.db
      .insertInto("feedback")
      .values({
        id,
        user_id: userId,
        kind: "idea",
        message: "m",
        version: "1.0.0",
        status,
        handled_by: status === "handled" ? userId : null,
        handled_at: handledAt ? at(handledAt) : null,
        created_at: at(sentAt),
      })
      .execute();
    return id;
  };
  const left = async () =>
    (await t.db.selectFrom("feedback").select("id").orderBy("id").execute()).map((r) => r.id);

  it("deletes only feedback handled before the feedback retention, by when it was handled", async () => {
    const old = await feedback("handled", second(FEEDBACK_CUTOFF, -1));
    const edge = await feedback("handled", FEEDBACK_CUTOFF);
    const inside = await feedback("handled", second(FEEDBACK_CUTOFF, 1));
    // Sent long ago, handled recently: kept. And new feedback is kept however old.
    const sentOldHandledNow = await feedback("handled", NOW);
    const stillNew = await feedback("new", null);
    expect(
      (await runRetentionPurge(t.db, t.dialect, POLICY, NOW, { dryRun: true })).feedbackDeleted,
    ).toBe(1);
    expect(await left()).toHaveLength(5);
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW);
    expect(counts.feedbackDeleted).toBe(1);
    expect(await left()).toEqual([edge, inside, sentOldHandledNow, stillNew].sort());
    expect(old).toBeTruthy();
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).feedbackDeleted).toBe(0);
  });

  it("keeps a message that is not handled, even with an old handled_at", async () => {
    const odd = await feedback("new", second(FEEDBACK_CUTOFF, -1));
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).feedbackDeleted).toBe(0);
    expect(await left()).toEqual([odd]);
  });

  it("follows root's number of days", async () => {
    const handled = await feedback("handled", new Date("2026-10-10T12:00:00Z"));
    await runRetentionPurge(t.db, t.dialect, POLICY, NOW);
    expect(await left()).toEqual([handled]);
    const counts = await runRetentionPurge(t.db, t.dialect, { ...POLICY, feedbackDays: 7 }, NOW);
    expect(counts.feedbackDeleted).toBe(1);
    expect(await left()).toEqual([]);
  });

  it("deletes more than a batch, in batches", async () => {
    for (let i = 0; i < PURGE_BATCH + 3; i++)
      await feedback("handled", second(FEEDBACK_CUTOFF, -10));
    const seen: number[] = [];
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      onBatch: (done) => {
        seen.push(done);
      },
    });
    expect(counts.feedbackDeleted).toBe(PURGE_BATCH + 3);
    expect(seen).toEqual([PURGE_BATCH, PURGE_BATCH + 3]);
    expect(await left()).toEqual([]);
  });

  it("leaves the audit log alone", async () => {
    await feedback("handled", second(FEEDBACK_CUTOFF, -1));
    const before = await t.db.selectFrom("audit_log").select("id").execute();
    await runRetentionPurge(t.db, t.dialect, POLICY, NOW);
    expect(await t.db.selectFrom("audit_log").select("id").execute()).toEqual(before);
  });
});

describe("notifications (139)", () => {
  const notification = async (createdAt: Date, user = userId, read = false) => {
    const id = newId();
    await t.db
      .insertInto("notifications")
      .values({
        id,
        user_id: user,
        kind: "submission.approved",
        subject_type: "submission",
        subject_id: newId(),
        params: "{}",
        created_at: at(createdAt),
        read_at: read ? at(createdAt) : null,
      })
      .execute();
    return id;
  };
  const left = async () =>
    (await t.db.selectFrom("notifications").select("id").orderBy("id").execute()).map((r) => r.id);
  const other = async () => {
    const id = newId();
    await t.db
      .insertInto("user")
      .values({
        id,
        name: "Bruno",
        email: "bruno@example.com",
        email_verified: t.dialect === "sqlite" ? 1 : true,
        image: null,
        created_at: toDbDate(NOW, t.dialect),
        updated_at: toDbDate(NOW, t.dialect),
      })
      .execute();
    return id;
  };

  it("deletes those older than 90 days, read or not, of anyone, and keeps the rest", async () => {
    const bruno = await other();
    await notification(second(NOTIFICATION_CUTOFF, -1));
    await notification(second(NOTIFICATION_CUTOFF, -1), userId, true);
    await notification(second(NOTIFICATION_CUTOFF, -1), bruno);
    // A row exactly at the cutoff is inside it: strictly older goes, as in the other rules.
    const edge = await notification(NOTIFICATION_CUTOFF);
    const inside = await notification(second(NOTIFICATION_CUTOFF, 1), bruno, true);
    const recent = await notification(NOW);
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW);
    expect(counts.notificationsDeleted).toBe(3);
    expect(await left()).toEqual([edge, inside, recent].sort());
    // Idempotent: a second run at the same moment changes nothing.
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).notificationsDeleted).toBe(0);
    expect(await left()).toHaveLength(3);
  });

  it("keeps to 90 days whatever root's retention numbers are", async () => {
    const old = await notification(new Date("2026-09-01T12:00:00Z"));
    await runRetentionPurge(t.db, t.dialect, { ipDays: 1, sessionsDays: 1, feedbackDays: 1 }, NOW);
    expect(await left()).toEqual([old]);
  });

  it("counts the same in a dry run and changes nothing", async () => {
    await notification(second(NOTIFICATION_CUTOFF, -5));
    await notification(second(NOTIFICATION_CUTOFF, -5), userId, true);
    await notification(NOW);
    const dry = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, { dryRun: true });
    expect(dry.notificationsDeleted).toBe(2);
    expect(await left()).toHaveLength(3);
    expect((await runRetentionPurge(t.db, t.dialect, POLICY, NOW)).notificationsDeleted).toBe(2);
    expect(await left()).toHaveLength(1);
  });

  it("deletes more than a batch, in batches, the oldest first", async () => {
    for (let i = 0; i < PURGE_BATCH + 3; i++)
      await notification(second(NOTIFICATION_CUTOFF, -10 - i));
    const seen: number[] = [];
    const counts = await runRetentionPurge(t.db, t.dialect, POLICY, NOW, {
      onBatch: (done) => {
        seen.push(done);
      },
    });
    expect(counts.notificationsDeleted).toBe(PURGE_BATCH + 3);
    expect(seen).toEqual([PURGE_BATCH, PURGE_BATCH + 3]);
    expect(await left()).toEqual([]);
  });

  it("leaves the audit log alone", async () => {
    await notification(second(NOTIFICATION_CUTOFF, -1));
    const before = await t.db.selectFrom("audit_log").select("id").execute();
    await runRetentionPurge(t.db, t.dialect, POLICY, NOW);
    expect(await t.db.selectFrom("audit_log").select("id").execute()).toEqual(before);
  });
});
