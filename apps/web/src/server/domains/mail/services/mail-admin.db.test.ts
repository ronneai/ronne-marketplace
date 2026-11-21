import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import type { CurrentUser } from "../../identity/models/user";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import {
  MailCredentialsUnreadableError,
  MailNotSetUpError,
  MailTestLimitError,
} from "../exceptions/errors";
import { MAIL_KEYS, parseLastStatus } from "../models/mail-settings";
import type { MailMessage, SendResult } from "../models/message";
import {
  type MailAdminContext,
  mailReadiness,
  sendTestEmail,
  stopSending,
  TESTS_PER_WINDOW,
} from "./mail-admin";
import { mailSetup, saveMailSetup } from "./mail-setup";
import { queueMail } from "./outbox";

let t: TestDb;
let root: CurrentUser;
let clock: Date;
const AUTH_SECRET = "test-secret-test-secret-test-secret-00";
const sent: MailMessage[] = [];
let answer: SendResult = { status: "sent" };
const context: MailAdminContext = {
  authSecret: AUTH_SECRET,
  allowedHosts: new Set(),
  publicUrl: "https://marketplace.acme.example",
  send: async (message) => {
    sent.push(message);
    return answer;
  },
};
const deps = () => ({ db: t.db, dialect: t.dialect, now: () => clock });
const repo = () => kyselySettingsRepository(t.db, t.dialect);
const asRoot = () => ({ user: root, ip: "203.0.113.9" });
const audits = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events.filter((e) => e.action === action);

beforeEach(async () => {
  t = await createTestDb();
  clock = new Date("2026-11-21T12:00:00.000Z");
  sent.length = 0;
  answer = { status: "sent" };
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@acme.example",
    name: "Root",
    password: "correct horse battery",
  });
  root = {
    id,
    email: "root@acme.example",
    name: "Root",
    role: "root",
    workspaces: {},
    locale: "fr",
  };
  await saveMailSetup(
    { repo: repo(), now: () => clock },
    asRoot(),
    {
      transport: "resend",
      fromAddress: "marketplace@acme.example",
      fromName: "Acme Marketplace",
      replyTo: "it-help@acme.example",
      contact: "it-help@acme.example",
      secret: "re_test_key",
    },
    context,
  );
});
afterEach(() => t.cleanup());

describe("Send test email (189)", () => {
  it("goes at once to root's own address, in root's language, and the status says working", async () => {
    expect(await sendTestEmail(deps(), asRoot(), context)).toEqual({ result: "sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "root@acme.example",
      from: { address: "marketplace@acme.example", name: "Acme Marketplace" },
      replyTo: "it-help@acme.example",
      subject: "Courriel d’essai de Ronne sur marketplace.acme.example",
    });
    expect(sent[0]?.text).toContain("it-help@acme.example");
    const view = await mailSetup({ repo: repo() }, asRoot(), context);
    expect(view.status).toMatchObject({ status: "working", at: clock.toISOString() });
    const [event] = await audits("mail.test_sent");
    expect(event?.metadata).toEqual({ result: "sent" });
    // Its row counts for the limit, and keeps no body.
    const rows = await t.db.selectFrom("mail_outbox").selectAll().execute();
    expect(rows).toMatchObject([
      { template: "test", user_id: root.id, status: "sent", body_enc: null },
    ]);
  });

  it("says why it failed, with the server's cleaned answer, and the status says failing", async () => {
    answer = { status: "failed", reason: "auth", detail: "535 5.7.8 authentication failed" };
    expect(await sendTestEmail(deps(), asRoot(), context)).toEqual({
      result: "failed",
      reason: "auth",
      detail: "535 5.7.8 authentication failed",
    });
    expect(parseLastStatus((await repo().get(MAIL_KEYS.lastStatus))?.value)).toMatchObject({
      status: "failing",
      reason: "auth",
    });
    const [event] = await audits("mail.test_sent");
    expect(event?.metadata).toEqual({ result: "failed", reason: "auth" });
    expect(JSON.stringify(event)).not.toContain("535");
  });

  it("allows 5 in 10 minutes to one root", async () => {
    for (let i = 0; i < TESTS_PER_WINDOW; i++) await sendTestEmail(deps(), asRoot(), context);
    await expect(sendTestEmail(deps(), asRoot(), context)).rejects.toBeInstanceOf(
      MailTestLimitError,
    );
    expect(sent).toHaveLength(TESTS_PER_WINDOW);
    clock = new Date(clock.getTime() + 10 * 60_000);
    expect(await sendTestEmail(deps(), asRoot(), context)).toEqual({ result: "sent" });
  });

  it("is refused while email isn't set up, or its credential can't be read", async () => {
    await expect(
      sendTestEmail(deps(), asRoot(), {
        ...context,
        authSecret: "another-secret-another-secret-0000",
      }),
    ).rejects.toBeInstanceOf(MailCredentialsUnreadableError);
    await stopSending(deps(), asRoot());
    await expect(sendTestEmail(deps(), asRoot(), context)).rejects.toBeInstanceOf(
      MailNotSetUpError,
    );
    expect(sent).toEqual([]);
  });

  it("is root's only", async () => {
    const user = { ...root, id: "01NOTROOT00000000000000000", role: "user" as const };
    await expect(sendTestEmail(deps(), { user, ip: null }, context)).rejects.toThrow();
    await expect(stopSending(deps(), { user, ip: null })).rejects.toThrow();
  });
});

describe("Stop sending (189)", () => {
  it("clears the transport, drops what waits, keeps the rest of the setup, and is audited", async () => {
    await queueMail(
      t.db,
      t.dialect,
      AUTH_SECRET,
      {
        template: "password_changed",
        locale: "en",
        to: "ana@acme.example",
        userId: null,
        subject: "s",
        text: "t",
        html: "h",
      },
      clock,
    );
    expect(await stopSending(deps(), asRoot())).toEqual({ stopped: true, dropped: 1 });
    const view = await mailSetup({ repo: repo() }, asRoot(), context);
    expect(view).toMatchObject({
      transport: "",
      status: "not_set_up",
      fromAddress: "marketplace@acme.example",
    });
    expect(await t.db.selectFrom("mail_outbox").select(["status", "body_enc"]).execute()).toEqual([
      { status: "dropped", body_enc: null },
    ]);
    const [event] = await audits("settings.mail");
    expect(event?.metadata).toMatchObject({
      stopped: true,
      dropped: 1,
      setup: { to: { transport: null } },
    });
    // Nothing more is queued.
    expect(
      await queueMail(
        t.db,
        t.dialect,
        AUTH_SECRET,
        {
          template: "password_changed",
          locale: "en",
          to: "ana@acme.example",
          userId: null,
          subject: "s",
          text: "t",
          html: "h",
        },
        clock,
      ),
    ).toEqual({ queued: false, reason: "not_set_up" });
    // Twice changes nothing.
    expect(await stopSending(deps(), asRoot())).toEqual({ stopped: false, dropped: 0 });
  });
});

describe("mailReadiness (189)", () => {
  it("says whether email can go out and what the contact is, for 190 and 194", async () => {
    expect(await mailReadiness(t.db, t.dialect)).toEqual({
      sending: true,
      contact: "it-help@acme.example",
    });
    await stopSending(deps(), asRoot());
    expect(await mailReadiness(t.db, t.dialect)).toEqual({
      sending: false,
      contact: "it-help@acme.example",
    });
    await t.db.deleteFrom("instance_settings").execute();
    expect(await mailReadiness(t.db, t.dialect)).toEqual({ sending: false, contact: "" });
  });
});
