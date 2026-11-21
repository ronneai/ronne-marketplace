import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Db } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { runRetentionPurge } from "../../../jobs/retention-purge";
import { sendMailNow } from "../../../jobs/scheduler";
import { listAuditEvents } from "../../audit/actions/audit";
import { endSessionsForNewSecret } from "../../identity/actions/instance-access";
import { createRoot } from "../../identity/actions/root-account";
import type { CurrentUser } from "../../identity/models/user";
import { kyselyEraseRepository } from "../../identity/repositories/kysely-erase-repository";
import { kyselyUserDataRepository } from "../../identity/repositories/kysely-user-data-repository";
import { eraseUser } from "../../identity/services/erase-user";
import { exportUserData } from "../../identity/services/user-data-export";
import { createTestUser, testAppAuth } from "../../identity/testing/test-auth";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { MAIL_KEYS, parseLastStatus } from "../models/mail-settings";
import type { MailMessage, SendResult } from "../models/message";
import {
  CLAIM_MS,
  MAX_ATTEMPTS,
  openBody,
  PER_ADDRESS_PER_HOUR,
  recipientHmac,
} from "../models/outbox";
import { kyselyOutboxRepository } from "../repositories/kysely-outbox-repository";
import { type MailSetupContext, saveMailSetup } from "./mail-setup";
import { deliverDue, dropWaitingMail, type QueuedMail, queueMail } from "./outbox";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
let clock: Date;
const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const context: MailSetupContext = { authSecret: AUTH_SECRET, allowedHosts: new Set() };
const mail = (extra: Partial<QueuedMail> = {}): QueuedMail => ({
  template: "password_changed",
  locale: "en",
  to: "ana@example.com",
  userId: null,
  subject: "Your password was changed",
  text: "Hello Ana",
  html: "<p>Hello Ana</p>",
  ...extra,
});
const queue = (extra: Partial<QueuedMail> = {}, db: Db = t.db) =>
  queueMail(db, t.dialect, AUTH_SECRET, mail(extra), clock);
const rows = () => t.db.selectFrom("mail_outbox").selectAll().orderBy("id").execute();
/** A provider that answers each try with the next of `answers`, and records what it got. */
const provider = (...answers: SendResult[]) => {
  const got: MailMessage[] = [];
  const send = async (message: MailMessage): Promise<SendResult> => {
    got.push(message);
    return answers.shift() ?? { status: "sent" };
  };
  return { got, send };
};
const deliver = (send: (m: MailMessage) => Promise<SendResult>, db: Db = t.db) =>
  deliverDue({ db, dialect: t.dialect, now: () => clock }, context, { send });
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const status = async () =>
  parseLastStatus(
    (await kyselySettingsRepository(t.db, t.dialect).get(MAIL_KEYS.lastStatus))?.value,
  );

beforeEach(async () => {
  t = await createTestDb();
  clock = new Date("2026-11-21T12:00:00.000Z");
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  await saveMailSetup(
    { repo: kyselySettingsRepository(t.db, t.dialect), now: () => clock },
    { user: root, ip: null },
    {
      transport: "resend",
      fromAddress: "marketplace@acme.example",
      fromName: "Acme Marketplace",
      replyTo: "it-help@acme.example",
      secret: "re_test_key",
    },
    context,
  );
});
afterEach(() => t.cleanup());

describe("queueMail (189)", () => {
  it("queues in the caller's transaction: a rolled-back change queues nothing", async () => {
    await expect(
      t.db.transaction().execute(async (trx) => {
        await queue({}, trx);
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await rows()).toEqual([]);
    await t.db.transaction().execute(async (trx) => {
      await queue({}, trx);
    });
    expect(await rows()).toHaveLength(1);
  });

  it("seals the body to its row and keeps only the address's keyed hash", async () => {
    const queued = await queue();
    const [row] = await rows();
    expect(row).toMatchObject({ status: "queued", attempts: 0, template: "password_changed" });
    expect(row?.recipient_hmac).toBe(recipientHmac(AUTH_SECRET, "ANA@example.com"));
    for (const clear of ["ana@example.com", "Hello Ana", "Your password"])
      expect(JSON.stringify(row)).not.toContain(clear);
    expect(
      openBody(AUTH_SECRET, queued.queued ? queued.id : "", row?.body_enc ?? ""),
    ).toMatchObject({
      to: "ana@example.com",
    });
    // Copied onto another row, the body doesn't open.
    expect(openBody(AUTH_SECRET, "01OTHERROW0000000000000000", row?.body_enc ?? "")).toBeNull();
  });

  it("queues nothing while email isn't set up, or to something that isn't an address", async () => {
    await t.db.deleteFrom("instance_settings").where("key", "=", MAIL_KEYS.transport).execute();
    expect(await queue()).toEqual({ queued: false, reason: "not_set_up" });
    await saveMailSetup(
      { repo: kyselySettingsRepository(t.db, t.dialect), now: () => clock },
      { user: root, ip: null },
      {
        transport: "resend",
        fromAddress: "m@acme.example",
        replyTo: "r@acme.example",
        secret: "k",
      },
      context,
    );
    expect(await queue({ to: "ana@example.com\r\nBcc: x@example.com" })).toEqual({
      queued: false,
      reason: "invalid",
    });
    expect(await rows()).toEqual([]);
  });

  it("holds at 10 an hour to one address, every template together, whatever its case", async () => {
    for (let i = 0; i < PER_ADDRESS_PER_HOUR; i++)
      expect((await queue({ template: i % 2 ? "two_factor_on" : "password_changed" })).queued).toBe(
        true,
      );
    expect(await queue({ to: "Ana@Example.com" })).toEqual({ queued: false, reason: "cap" });
    expect((await queue({ to: "bruno@example.com" })).queued).toBe(true);
    advance(60 * 60_000);
    expect((await queue()).queued).toBe(true);
  });
});

describe("deliverDue (189)", () => {
  it("sends, then deletes the body and records the setup working", async () => {
    await queue();
    const { got, send } = provider({ status: "sent" });
    expect(await deliver(send)).toEqual({ sent: 1, retried: 0, failed: 0, dropped: 0 });
    expect(got[0]).toMatchObject({
      to: "ana@example.com",
      from: { address: "marketplace@acme.example", name: "Acme Marketplace" },
      replyTo: "it-help@acme.example",
      subject: "Your password was changed",
    });
    expect(got[0]?.idempotencyKey).toMatch(/^[0-9A-Z]{26}$/);
    const [row] = await rows();
    expect(row).toMatchObject({ status: "sent", body_enc: null, claim_id: null });
    expect(row?.sent_at).not.toBeNull();
    expect(await status()).toMatchObject({ status: "working" });
    // Done: nothing is sent twice.
    expect(await deliver(send)).toEqual({ sent: 0, retried: 0, failed: 0, dropped: 0 });
  });

  it("retries on the schedule, 1, 5, 15, 60 minutes then 3 hours, and fails after 8 tries", async () => {
    await queue();
    const waits = [1, 5, 15, 60, 180, 180, 180].map((m) => m * 60_000);
    const { got, send } = provider(
      ...Array.from({ length: MAX_ATTEMPTS }, () => ({
        status: "retry" as const,
        reason: "server" as const,
      })),
    );
    for (const wait of waits) {
      expect(await deliver(send)).toMatchObject({ retried: 1 });
      const [row] = await rows();
      expect(row?.status).toBe("queued");
      // Not before its time.
      advance(wait - 1000);
      expect(await deliver(send)).toEqual({ sent: 0, retried: 0, failed: 0, dropped: 0 });
      advance(1000);
    }
    expect(await status()).toBeNull();
    expect(await deliver(send)).toMatchObject({ failed: 1 });
    expect(got).toHaveLength(MAX_ATTEMPTS);
    const [row] = await rows();
    expect(row).toMatchObject({
      status: "failed",
      body_enc: null,
      attempts: MAX_ATTEMPTS,
      last_error: "server",
    });
    expect(await status()).toMatchObject({ status: "failing", reason: "server" });
  });

  it("fails at once on a permanent error, its body deleted", async () => {
    await queue();
    const { send } = provider({ status: "failed", reason: "rejected" });
    expect(await deliver(send)).toMatchObject({ failed: 1 });
    expect((await rows())[0]).toMatchObject({ status: "failed", body_enc: null, attempts: 1 });
    expect(await status()).toMatchObject({ status: "failing", reason: "rejected" });
  });

  it("waits as long as a 429's Retry-After says, when that's longer than the schedule", async () => {
    await queue();
    const { got, send } = provider({ status: "retry", reason: "rate_limited", waitSeconds: 600 });
    await deliver(send);
    advance(5 * 60_000);
    await deliver(send);
    expect(got).toHaveLength(1);
    advance(5 * 60_000);
    await deliver(send);
    expect(got).toHaveLength(2);
  });

  it("drops a code's email once its code expired, never sending it late", async () => {
    await queue({ template: "sign_up_code", expiresAt: new Date(clock.getTime() + 60_000) });
    advance(61_000);
    const { got, send } = provider();
    expect(await deliver(send)).toMatchObject({ dropped: 1 });
    expect(got).toEqual([]);
    expect((await rows())[0]).toMatchObject({
      status: "dropped",
      body_enc: null,
      last_error: "expired",
    });
  });

  it("drops a body this AUTH_SECRET can't open", async () => {
    await queue();
    await t.db.updateTable("mail_outbox").set({ body_enc: "v1.not.sealed" }).execute();
    expect(await deliver(provider().send)).toMatchObject({ dropped: 1 });
    expect((await rows())[0]).toMatchObject({
      status: "dropped",
      body_enc: null,
      last_error: "unreadable",
    });
  });

  it("drops what was queued once root stops sending", async () => {
    await queue();
    await queue({ to: "bruno@example.com" });
    expect(await dropWaitingMail(t.db, t.dialect)).toBe(2);
    expect((await rows()).map((r) => [r.status, r.body_enc])).toEqual([
      ["dropped", null],
      ["dropped", null],
    ]);
  });

  it("never sends one row twice when two connections take the same row at once", async () => {
    const queued = await queue();
    const ids = queued.queued ? [queued.id] : [];
    const second = t.url === "file::memory:" ? t.db : createDb(t.url).db;
    try {
      let sends = 0;
      const slow = async () => {
        sends++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { status: "sent" } as const;
      };
      // Both runs are handed the row, as two kicks would be: only the claim keeps them apart.
      const run = (db: Db) =>
        deliverDue({ db, dialect: t.dialect, now: () => clock }, context, { ids, send: slow });
      const [a, b] = await Promise.all([run(t.db), run(second)]);
      expect(sends).toBe(1);
      expect(a.sent + b.sent).toBe(1);
    } finally {
      if (second !== t.db) await second.destroy();
    }
  });

  it("sends at once with RONNE_JOBS=off, the scheduler being off", async () => {
    const queued = await queue();
    const { got, send } = provider();
    await sendMailNow(
      {
        DATABASE_URL: "sqlite:./unused.db",
        AUTH_SECRET,
        RONNE_JOBS: "off",
        RONNE_ENV_FILE: "/nonexistent/ronne-test.env",
      },
      queued.queued ? [queued.id] : [],
      { open: () => ({ db: t.db, dialect: t.dialect }), send },
    );
    expect(got.map((m) => m.to)).toEqual(["ana@example.com"]);
  });

  it("sends only the rows it's handed, leaving a due retry to the scheduler", async () => {
    await queue();
    await deliver(provider({ status: "retry", reason: "server" }).send);
    advance(60_000);
    const fresh = await queue({ to: "bruno@example.com" });
    const { got, send } = provider();
    await deliverDue({ db: t.db, dialect: t.dialect, now: () => clock }, context, {
      ids: fresh.queued ? [fresh.id] : [],
      send,
    });
    expect(got.map((m) => m.to)).toEqual(["bruno@example.com"]);
  });

  it("lets only the claim's holder end a row, even while it's still sending", async () => {
    const queued = await queue();
    const id = queued.queued ? queued.id : "";
    const repo = kyselyOutboxRepository(t.db, t.dialect);
    expect(
      await repo.claim(
        id,
        clock,
        "01HOLDER000000000000000000",
        new Date(clock.getTime() + CLAIM_MS),
      ),
    ).toBe(true);
    expect(
      await repo.finish(id, "01OTHER0000000000000000000", {
        status: "failed",
        attempts: 1,
        lastError: "x",
      }),
    ).toBe(false);
    expect((await rows())[0]).toMatchObject({
      status: "sending",
      claim_id: "01HOLDER000000000000000000",
    });
    expect(await repo.finish(id, "01HOLDER000000000000000000", { status: "sent", at: clock })).toBe(
      true,
    );
  });

  it("keeps the setup working when a run whose claim ran out answers late with a failure", async () => {
    await queue();
    const late = async () => {
      // This send outlasts its claim: another run takes the row and sends it meanwhile.
      advance(CLAIM_MS + 1000);
      expect(await deliver(provider({ status: "sent" }).send)).toMatchObject({ sent: 1 });
      return { status: "failed", reason: "rejected" } as const;
    };
    expect(await deliver(late)).toMatchObject({ sent: 0, failed: 0 });
    expect((await rows())[0]).toMatchObject({ status: "sent", body_enc: null });
    expect(await status()).toMatchObject({ status: "working" });
  });

  it("sends a code's email up to the instant its code expires, and not at it", async () => {
    await queue({ template: "sign_up_code", expiresAt: new Date(clock.getTime() + 1) });
    await queue({ template: "sign_up_code", to: "bruno@example.com", expiresAt: clock });
    const { got, send } = provider();
    expect(await deliver(send)).toMatchObject({ sent: 1, dropped: 1 });
    expect(got.map((m) => m.to)).toEqual(["ana@example.com"]);
  });

  it("counts a try that never ended, and fails a row cut off 8 times without sending it", async () => {
    const queued = await queue();
    const id = queued.queued ? queued.id : "";
    const repo = kyselyOutboxRepository(t.db, t.dialect);
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(
        await repo.claim(
          id,
          clock,
          `01DEAD${String(i).padStart(20, "0")}`,
          new Date(clock.getTime() + CLAIM_MS),
        ),
      ).toBe(true);
      advance(CLAIM_MS + 1000);
    }
    expect((await rows())[0]?.attempts).toBe(MAX_ATTEMPTS);
    const { got, send } = provider();
    expect(await deliver(send)).toMatchObject({ failed: 1 });
    expect(got).toEqual([]);
    expect((await rows())[0]).toMatchObject({
      status: "failed",
      body_enc: null,
      last_error: "interrupted",
    });
  });

  it("waits at most a day for a provider's Retry-After, however large", async () => {
    await queue();
    await deliver(provider({ status: "retry", reason: "rate_limited", waitSeconds: 1e15 }).send);
    const [row] = await rows();
    expect(row?.status).toBe("queued");
    advance(24 * 60 * 60_000 - 1000);
    expect(await deliver(provider().send)).toMatchObject({ sent: 0 });
    advance(1000);
    expect(await deliver(provider().send)).toMatchObject({ sent: 1 });
  });

  it("takes a row again once a claim ran out (a run that died), and only the new claim finishes", async () => {
    const queued = await queue();
    const id = queued.queued ? queued.id : "";
    const repo = kyselyOutboxRepository(t.db, t.dialect);
    expect(
      await repo.claim(id, clock, "01DEADRUN00000000000000000", new Date(clock.getTime() + 60_000)),
    ).toBe(true);
    expect(await deliver(provider().send)).toMatchObject({ sent: 0 });
    advance(61_000);
    expect(await deliver(provider().send)).toMatchObject({ sent: 1 });
    // The dead run's late answer changes nothing.
    expect(
      await repo.finish(id, "01DEADRUN00000000000000000", {
        status: "failed",
        attempts: 1,
        lastError: "x",
      }),
    ).toBe(false);
    expect((await rows())[0]?.status).toBe("sent");
  });
});

describe("the outbox and personal data (189)", () => {
  const seedAna = async () => {
    const app = testAppAuth(t);
    return createTestUser(app, { email: "ana@example.com", password: "correct horse battery" });
  };

  it("keeps a re-sealed body readable after rotate-secret", async () => {
    await queue();
    const next = "rotated-secret-rotated-secret-00000";
    await endSessionsForNewSecret(t.db, t.dialect, () => {}, { from: AUTH_SECRET, to: next });
    const [row] = await rows();
    expect(openBody(AUTH_SECRET, row?.id ?? "", row?.body_enc ?? "")).toBeNull();
    expect(openBody(next, row?.id ?? "", row?.body_enc ?? "")).toMatchObject({
      to: "ana@example.com",
    });
  });

  it("drops and counts, on rotate-secret, a queued body the old secret can't open", async () => {
    await queue();
    await queue({ to: "bruno@example.com" });
    await queue({ to: "carla@example.com" });
    const [, other] = await rows();
    await t.db
      .updateTable("mail_outbox")
      .set({ body_enc: "v1.not.sealed" })
      .where("id", "=", other?.id ?? "")
      .execute();
    const next = "rotated-secret-rotated-secret-00000";
    const result = await endSessionsForNewSecret(t.db, t.dialect, () => {}, {
      from: AUTH_SECRET,
      to: next,
    });
    expect(result).toMatchObject({ mailResealed: 2, mailDropped: 1 });
    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "instance.secret_rotated",
    );
    expect(event?.metadata).toMatchObject({ mailResealed: 2, mailDropped: 1 });
    expect(JSON.stringify(event?.metadata)).not.toContain("example.com");
    expect((await rows()).map((r) => [r.status, r.body_enc === null])).toEqual([
      ["queued", false],
      ["dropped", true],
      ["queued", false],
    ]);
  });

  it("is purged after the IP retention, whatever became of each row", async () => {
    await queue();
    advance(91 * 24 * 60 * 60_000);
    await queue({ to: "bruno@example.com" });
    const counts = await runRetentionPurge(
      t.db,
      t.dialect,
      { ipDays: 90, sessionsDays: 30, feedbackDays: 365 },
      clock,
    );
    expect(counts.mailDeleted).toBe(1);
    expect(await rows()).toHaveLength(1);
  });

  it("is erased with the person, and in their data download without address or body", async () => {
    const ana = await seedAna();
    await queue({ userId: ana });
    await deliver(provider().send);
    await queue({ userId: ana, template: "two_factor_off" });
    await queue({ userId: null, to: "bruno@example.com" });
    const actor = { user: root, ip: null };
    const { data } = await exportUserData(
      { repo: kyselyUserDataRepository(t.db, t.dialect) },
      actor,
      ana,
    );
    expect(data.emails).toEqual([
      {
        template: "password_changed",
        status: "sent",
        queuedAt: expect.any(Date),
        sentAt: expect.any(Date),
      },
      { template: "two_factor_off", status: "queued", queuedAt: expect.any(Date), sentAt: null },
    ]);
    expect(JSON.stringify(data.emails)).not.toContain("Hello Ana");
    await eraseUser({ repo: kyselyEraseRepository(t.db, t.dialect) }, actor, ana, {
      confirm: "ana@example.com",
    });
    const left = await rows();
    expect(left).toHaveLength(1);
    expect(left[0]?.user_id).toBeNull();
  });

  it("purges by when each row was queued", async () => {
    await queue();
    await t.db
      .updateTable("mail_outbox")
      .set({ created_at: toDbDate(new Date("2026-01-01T00:00:00Z"), t.dialect) })
      .execute();
    expect(
      (
        await runRetentionPurge(
          t.db,
          t.dialect,
          { ipDays: 90, sessionsDays: 30, feedbackDays: 365 },
          clock,
          { dryRun: true },
        )
      ).mailDeleted,
    ).toBe(1);
    expect(await rows()).toHaveLength(1);
  });
});
