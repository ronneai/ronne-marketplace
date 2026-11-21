import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { memoryRateLimiter } from "../../../rate-limit/memory-store";
import { noticesStillSending, withNoticesSent } from "../../../setup/cli-mail";
import { MAIL_KEYS } from "../../mail/models/mail-settings";
import type { MailMessage } from "../../mail/models/message";
import { openBody } from "../../mail/models/outbox";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { onMailQueued } from "../../mail/services/notices";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { BACKUP_CODES_LIMIT, LOGIN_LIMIT } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import { createRoot, resetRootPassword, resetTwoFactorFromCli } from "./root-account";
import { changePassword, signIn } from "./session";
import {
  confirmTwoFactor,
  regenerateBackupCodes,
  startTwoFactor,
  turnOffTwoFactor,
} from "./two-factor";
import { adminResetPassword, adminResetTwoFactor } from "./user-admin";

// Feature 189, task 8: each security event queues one notice to the account's own address.
const SECRET = "test-secret-test-secret-test-secret-00";
const password = "correct horse battery";
let t: TestDb;
let app: AppAuth;
let anaId: string;
let rootId: string;

const headersFor = async (email: string, pass = password) => {
  const result = await signIn(
    new Headers({ "x-forwarded-for": "203.0.113.9" }),
    { email, password: pass, rememberMe: false },
    app,
  );
  if (!result.ok) throw new Error(`sign-in failed for ${email}: ${result.error}`);
  const headers = cookieHeaders(result.headers.get("set-cookie"));
  headers.set("x-forwarded-for", "203.0.113.9");
  return headers;
};
const root = {
  id: "",
  email: "root@example.com",
  name: "Root",
  role: "root" as const,
  workspaces: {},
};
const emailOn = (contact = "it-help@acme.example") =>
  saveMailSetup(
    { repo: kyselySettingsRepository(t.db, t.dialect) },
    { user: { ...root, id: rootId }, ip: null },
    {
      transport: "resend",
      fromAddress: "marketplace@acme.example",
      replyTo: "it-help@acme.example",
      contact,
      secret: "re_test_key",
    },
    { authSecret: SECRET, allowedHosts: new Set() },
  );
/** The notices queued, oldest first, each body opened. */
const notices = async () => {
  const rows = await t.db.selectFrom("mail_outbox").selectAll().orderBy("id").execute();
  return rows.map((row) => ({
    template: row.template,
    userId: row.user_id,
    locale: row.locale,
    body: row.body_enc ? openBody(SECRET, row.id, row.body_enc) : null,
  }));
};
const enrol = async (headers: Headers, pass = password) => {
  const started = await startTwoFactor(headers, { password: pass }, app);
  if (!started.ok) throw new Error(started.error);
  const confirmed = await confirmTwoFactor(
    headers,
    { code: totpCode(started.uri), uri: started.uri },
    app,
  );
  if (!confirmed.ok) throw new Error(confirmed.error);
  const session = cookieHeaders(confirmed.headers.get("set-cookie"));
  session.set("x-forwarded-for", "203.0.113.9");
  return { started, session };
};

beforeEach(async () => {
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("PUBLIC_URL", "https://marketplace.acme.example");
  t = await createTestDb();
  app = testAppAuth(t, {
    trustProxy: true,
    limiter: memoryRateLimiter({ ...LOGIN_LIMIT, max: 1000 }),
    backupCodesLimiter: memoryRateLimiter({ ...BACKUP_CODES_LIMIT, max: 1000 }),
  });
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  anaId = await createTestUser(app, { email: "ana@example.com", password });
  // Ana reads Portuguese.
  await t.db.updateTable("user").set({ locale: "pt" }).where("id", "=", anaId).execute();
});
afterEach(async () => {
  onMailQueued(undefined);
  vi.unstubAllEnvs();
  await t.cleanup();
});

describe("security notices (189)", () => {
  it("a password change queues one, to the account's own address, in its language, with the contact", async () => {
    await emailOn();
    const ana = await headersFor("ana@example.com");
    expect(
      (await changePassword(ana, { current: password, next: "a brand new passphrase" }, app)).ok,
    ).toBe(true);
    const [notice, ...rest] = await notices();
    expect(rest).toEqual([]);
    expect(notice).toMatchObject({ template: "password_changed", userId: anaId, locale: "pt" });
    expect(notice?.body).toMatchObject({
      to: "ana@example.com",
      subject: "A sua senha foi alterada",
    });
    expect(notice?.body?.text).toContain("escreva para it-help@acme.example");
    expect(notice?.body?.text).toContain("marketplace.acme.example");
  });

  it("says to reply when the instance contact is empty", async () => {
    await emailOn("");
    const ana = await headersFor("ana@example.com");
    await changePassword(ana, { current: password, next: "a brand new passphrase" }, app);
    const [notice] = await notices();
    expect(notice?.body?.text).toContain(
      "Para falar com o seu administrador, responda a este e-mail.",
    );
    expect(notice?.body?.text).not.toContain("escreva para");
  });

  it("a failed change queues none, and nothing is queued while email is off", async () => {
    await emailOn();
    const ana = await headersFor("ana@example.com");
    expect(
      (
        await changePassword(
          ana,
          { current: "wrong horse battery", next: "a brand new passphrase" },
          app,
        )
      ).ok,
    ).toBe(false);
    expect(await notices()).toEqual([]);
    await t.db
      .updateTable("instance_settings")
      .set({ value: "" })
      .where("key", "=", MAIL_KEYS.transport)
      .execute();
    expect(
      (await changePassword(ana, { current: password, next: "a brand new passphrase" }, app)).ok,
    ).toBe(true);
    expect(await notices()).toEqual([]);
  });

  it("two-factor on, new backup codes and two-factor off each queue one; a wrong code queues none", async () => {
    await emailOn();
    const { started, session } = await enrol(await headersFor("ana@example.com"));
    expect((await regenerateBackupCodes(session, { password }, app)).ok).toBe(true);
    expect((await turnOffTwoFactor(session, { password, code: "000000" }, app)).ok).toBe(false);
    const regenerated = await notices();
    expect(regenerated.map((n) => n.template)).toEqual([
      "two_factor_enabled",
      "backup_codes_regenerated",
    ]);
    // The first set was replaced: one of the new codes turns it off.
    const fresh = (await regenerateBackupCodes(session, { password }, app)) as {
      backupCodes: string[];
    };
    expect(started.backupCodes.length).toBeGreaterThan(0);
    expect(
      (await turnOffTwoFactor(session, { password, code: fresh.backupCodes[0] ?? "" }, app)).ok,
    ).toBe(true);
    const all = await notices();
    expect(all.map((n) => n.template)).toEqual([
      "two_factor_enabled",
      "backup_codes_regenerated",
      "backup_codes_regenerated",
      "two_factor_disabled",
    ]);
    for (const notice of all)
      expect(notice).toMatchObject({
        userId: anaId,
        locale: "pt",
        body: { to: "ana@example.com" },
      });
  });

  it("root's password reset and two-factor reset on the web each queue one to the person", async () => {
    await emailOn();
    const asRoot = await headersFor("root@example.com");
    await adminResetPassword(asRoot, anaId, "another fine passphrase", app);
    await enrol(
      await headersFor("ana@example.com", "another fine passphrase"),
      "another fine passphrase",
    );
    await adminResetTwoFactor(asRoot, anaId, app);
    expect((await notices()).map((n) => [n.template, n.body?.to])).toEqual([
      ["password_reset", "ana@example.com"],
      ["two_factor_enabled", "ana@example.com"],
      ["two_factor_reset", "ana@example.com"],
    ]);
  });

  it("the terminal's reset-root-password and two-factor reset queue one too, and a refused one none", async () => {
    await emailOn();
    await expect(
      resetRootPassword(t.db, t.dialect, "a long new root passphrase", "nobody@example.com"),
    ).rejects.toThrow();
    expect(await notices()).toEqual([]);
    await resetRootPassword(t.db, t.dialect, "a long new root passphrase");
    await enrol(await headersFor("ana@example.com"));
    await resetTwoFactorFromCli(t.db, t.dialect, "ana@example.com");
    expect((await notices()).map((n) => [n.template, n.userId, n.locale])).toEqual([
      ["password_reset", rootId, "en"],
      ["two_factor_enabled", anaId, "pt"],
      ["two_factor_reset", anaId, "pt"],
    ]);
  });

  it("hands the queued rows on only once their transaction has committed", async () => {
    await emailOn();
    const heard: string[][] = [];
    onMailQueued((ids) => heard.push([...ids]));
    const ana = await headersFor("ana@example.com");
    await changePassword(
      ana,
      { current: "wrong horse battery", next: "a brand new passphrase" },
      app,
    );
    expect(heard).toEqual([]);
    await changePassword(ana, { current: password, next: "a brand new passphrase" }, app);
    const rows = await t.db.selectFrom("mail_outbox").select("id").execute();
    expect(heard).toEqual([rows.map((r) => r.id)]);
  });

  it("hands on nothing from a transaction that rolls back, and a committed one's only after it commits", async () => {
    await emailOn();
    const heard: string[][] = [];
    onMailQueued((ids) => heard.push([...ids]));
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    await expect(
      repo.transaction(async (trx) => {
        await trx.queueSecurityNotice(anaId, "password_changed", new Date());
        expect(heard).toEqual([]);
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(heard).toEqual([]);
    expect(await notices()).toEqual([]);
    await repo.transaction(async (trx) => {
      await trx.queueSecurityNotice(anaId, "password_changed", new Date());
      // Queued, but not committed yet: nothing is handed on.
      expect(heard).toEqual([]);
    });
    expect(heard).toHaveLength(1);
  });

  /** Runs `work` with `table` out of the way, so writing to it fails; then puts it back. */
  const without = async (table: "mail_outbox" | "audit_log", work: () => Promise<unknown>) => {
    await sql`alter table ${sql.table(table)} rename to ${sql.table(`${table}_away`)}`.execute(
      t.db,
    );
    try {
      await work();
    } finally {
      await sql`alter table ${sql.table(`${table}_away`)} rename to ${sql.table(table)}`.execute(
        t.db,
      );
    }
  };
  const audits = (action: string) =>
    t.db.selectFrom("audit_log").select("id").where("action", "=", action).execute();

  it("is in the change's transaction: a notice that can't be queued takes the audit row with it", async () => {
    await emailOn();
    const ana = await headersFor("ana@example.com");
    await without("mail_outbox", () =>
      expect(
        changePassword(ana, { current: password, next: "a brand new passphrase" }, app),
      ).rejects.toThrow(),
    );
    expect(await audits("user.password_changed")).toEqual([]);
    const { session } = await enrol(
      await headersFor("ana@example.com", "a brand new passphrase"),
      "a brand new passphrase",
    );
    const codes = (await regenerateBackupCodes(
      session,
      { password: "a brand new passphrase" },
      app,
    )) as {
      backupCodes: string[];
    };
    await without("mail_outbox", () =>
      expect(
        turnOffTwoFactor(
          session,
          { password: "a brand new passphrase", code: codes.backupCodes[0] ?? "" },
          app,
        ),
      ).rejects.toThrow(),
    );
    expect(await audits("auth.two_factor_disabled")).toEqual([]);
  });

  it("and an audit row that can't be written takes its notice with it", async () => {
    await emailOn();
    const ana = await headersFor("ana@example.com");
    await without("audit_log", () =>
      expect(
        changePassword(ana, { current: password, next: "a brand new passphrase" }, app),
      ).rejects.toThrow(),
    );
    expect(await notices()).toEqual([]);
    const asRoot = await headersFor("root@example.com");
    await without("audit_log", () =>
      expect(adminResetPassword(asRoot, anaId, "another fine passphrase", app)).rejects.toThrow(),
    );
    expect(await notices()).toEqual([]);
  });

  it("a terminal command sends its notice before it exits, from its own settings", async () => {
    await emailOn();
    const sent: string[] = [];
    await withNoticesSent(
      t.db,
      t.dialect,
      "/nonexistent-ronne-app",
      () => resetRootPassword(t.db, t.dialect, "a long new root passphrase"),
      async (message) => {
        sent.push(message.to);
        return { status: "sent" };
      },
    );
    expect(sent).toEqual(["root@example.com"]);
    expect(await t.db.selectFrom("mail_outbox").select(["status", "body_enc"]).execute()).toEqual([
      { status: "sent", body_enc: null },
    ]);
  });

  it("hands rows on once per committed transaction, none for a rollback, in both repositories", async () => {
    await emailOn();
    const heard: string[][] = [];
    onMailQueued((ids) => heard.push([...ids]));
    await kyselyIdentityRepository(t.db, t.dialect).transaction((trx) =>
      trx.queueSecurityNotice(anaId, "password_changed", new Date()),
    );
    await kyselySsoRepository(t.db, t.dialect).transaction((trx) =>
      trx.queueSecurityNotice(anaId, "sso_linked", new Date(), "Acme SSO"),
    );
    await expect(
      kyselySsoRepository(t.db, t.dialect).transaction(async (trx) => {
        await trx.queueSecurityNotice(anaId, "sso_linked", new Date(), "Acme SSO");
        throw new Error("the link failed");
      }),
    ).rejects.toThrow("the link failed");
    // One hand-on per committed transaction, of its one row; none for the rolled-back one.
    expect(heard.map((ids) => ids.length)).toEqual([1, 1]);
    const rows = await t.db.selectFrom("mail_outbox").select("id").execute();
    expect(heard.flat().sort()).toEqual(rows.map((r) => r.id).sort());
  });

  it("a terminal command reads its own instance's settings file, whatever the environment", async () => {
    await emailOn();
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("PUBLIC_URL", "");
    vi.stubEnv("RONNE_ENV_FILE", "");
    const appDir = mkdtempSync(join(tmpdir(), "ronne-189-"));
    try {
      writeFileSync(
        join(appDir, ".env"),
        `AUTH_SECRET=${SECRET}\nPUBLIC_URL=https://own-instance.example\n`,
      );
      const sent: MailMessage[] = [];
      await withNoticesSent(
        t.db,
        t.dialect,
        appDir,
        () => resetRootPassword(t.db, t.dialect, "a long new root passphrase"),
        async (message) => {
          sent.push(message);
          return { status: "sent" };
        },
      );
      expect(sent.map((m) => m.to)).toEqual(["root@example.com"]);
      expect(sent[0]?.text).toContain("own-instance.example");
    } finally {
      rmSync(appDir, { recursive: true, force: true });
    }
  });

  it("every notice shares its change's transaction: with the audit unwritable, none is left", async () => {
    await emailOn();
    const kinds = async () => (await notices()).map((n) => n.template);
    const refused = async (work: () => Promise<unknown>) =>
      without("audit_log", async () => {
        let failed = false;
        try {
          const result = (await work()) as { ok?: boolean } | undefined;
          failed = result?.ok === false;
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
      });
    const asRoot = await headersFor("root@example.com");
    // Two-factor on, for Bea: started, then confirmed while the audit can't be written. (Better
    // Auth has turned it on by then: the change stands without its row and its notice.)
    await createTestUser(app, { email: "bea@example.com", password });
    const bea = await headersFor("bea@example.com");
    const started = await startTwoFactor(bea, { password }, app);
    if (!started.ok) throw new Error(started.error);
    await refused(() =>
      confirmTwoFactor(bea, { code: totpCode(started.uri), uri: started.uri }, app),
    );
    expect(await kinds()).toEqual([]);
    // The rest need Ana's two-factor on: enrolled for real (its notice is the one row expected).
    const ana = await headersFor("ana@example.com");
    const { session } = await enrol(ana);
    expect(await kinds()).toEqual(["two_factor_enabled"]);
    await refused(() => regenerateBackupCodes(session, { password }, app));
    expect(await kinds()).toEqual(["two_factor_enabled"]);
    const codes = (await regenerateBackupCodes(session, { password }, app)) as {
      backupCodes: string[];
    };
    await t.db.deleteFrom("mail_outbox").execute();
    // The resets are one transaction of Ronne's, so a refused one leaves two-factor on; turning
    // it off goes through Better Auth first, which turns it off for good: it comes last.
    await refused(() => adminResetTwoFactor(asRoot, anaId, app));
    await refused(() => resetTwoFactorFromCli(t.db, t.dialect, "ana@example.com"));
    await refused(() =>
      turnOffTwoFactor(session, { password, code: codes.backupCodes[0] ?? "" }, app),
    );
    await refused(() => adminResetPassword(asRoot, anaId, "another fine passphrase", app));
    await refused(() => resetRootPassword(t.db, t.dialect, "a long new root passphrase"));
    await refused(() =>
      changePassword(ana, { current: password, next: "a brand new passphrase" }, app),
    );
    expect(await kinds()).toEqual([]);
  });

  it("a terminal command doesn't wait past its limit for a server that hangs", async () => {
    await emailOn();
    const started = Date.now();
    await withNoticesSent(
      t.db,
      t.dialect,
      "/nonexistent-ronne-app",
      () => resetRootPassword(t.db, t.dialect, "a long new root passphrase"),
      () => new Promise(() => {}),
      200,
    );
    expect(Date.now() - started).toBeLessThan(5000);
    // The script exits at once rather than wait for the connection.
    expect(noticesStillSending()).toBe(true);
    // Left claimed: the server's outbox takes it again once the claim runs out.
    expect(await t.db.selectFrom("mail_outbox").select(["status"]).execute()).toEqual([
      { status: "sending" },
    ]);
  });
});
