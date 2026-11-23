import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { openBody } from "../../mail/models/outbox";
import { stopSending } from "../../mail/services/mail-admin";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { PASSWORD_SIGN_IN_POLICY_KEY } from "../../settings/models/password-sign-in-policy";
import { SIGN_UP_KEYS } from "../../settings/models/sign-up-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { setPasswordResetPolicy } from "../../settings/services/password-reset";
import { passwordResetDeps } from "../actions/password-reset";
import { createRoot } from "../actions/root-account";
import { RESET_REQUEST_IP_LIMIT, resetTokenHash } from "../models/password-reset";
import { formStamp, issueChallenge } from "../models/sign-up-guard";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import type { PasswordResetRepository } from "../repositories/password-reset-repository";
import { createTestUser, TEST_SECRET, testAppAuth } from "../testing/test-auth";
import * as reset from "./password-reset";

let t: TestDb;
let app: AppAuth;
let root: CurrentUser;
let clock: Date;
const PASSWORD = "correct horse battery";
const settings = () => kyselySettingsRepository(t.db, t.dialect);
/** The service's deps, with no wait: the answer's time floor has its own tests below. */
const deps = (minimumMs = 0): reset.PasswordResetDeps => ({
  ...passwordResetDeps(app, {
    authSecret: TEST_SECRET,
    publicUrl: "https://marketplace.acme.com",
    now: () => clock,
  }),
  minimumMs,
});
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

/** The form as the page draws it: its stamp from 5 seconds ago. */
const form = (fields: Partial<reset.ResetRequest> = {}): reset.ResetRequest => ({
  email: "ana@acme.com",
  locale: "en",
  stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
  honeypot: "",
  challenge: undefined,
  ip: null,
  ...fields,
});
const request = (fields: Partial<reset.ResetRequest> = {}, d = deps()) =>
  reset.requestPasswordReset(d, form(fields));

/** The emails queued, opened, oldest first. */
const mails = async () => {
  const rows = await t.db
    .selectFrom("mail_outbox")
    .select(["id", "template", "user_id", "body_enc", "locale"])
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  return rows.map((row) => ({
    template: row.template,
    userId: row.user_id,
    locale: row.locale,
    ...(row.body_enc ? openBody(TEST_SECRET, row.id, row.body_enc) : null),
  }));
};
const codeIn = (text: string | undefined) => /\b(\d{6})\b/.exec(text ?? "")?.[1] ?? "";
const audits = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events.filter(
    (e) => e.action === "auth.password_reset_requested",
  );
const flows = () =>
  t.db.selectFrom("password_reset_flows").selectAll().orderBy("created_at").orderBy("id").execute();
const codes = () =>
  t.db
    .selectFrom("email_codes")
    .selectAll()
    .where("purpose", "=", "password_reset")
    .orderBy("created_at")
    .execute();

const user = (email: string) =>
  createTestUser(app, { email, password: PASSWORD, name: "Ana Lima" });
/** An account an identity provider made: no password, linked to `Acme Entra`. */
const ssoUser = async (email: string) => {
  const at = toDbDate(clock, t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id: "acme",
      type: "oidc",
      preset: "entra",
      name: "Acme Entra",
      enabled: toDbBoolean(true, t.dialect),
      config: "{}",
      secret_enc: null,
      domains: "[]",
      created_at: at,
      updated_at: at,
    } as never)
    .execute();
  const ctx = await app.auth.$context;
  const created = await ctx.internalAdapter.createUser(
    { email, name: "Carla", emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "acme",
    accountId: "carla-subject",
  });
  return created.id;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date("2026-11-23T12:00:00.000Z");
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@acme.com",
    name: "Root",
    password: PASSWORD,
  });
  root = { id, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  await saveMailSetup(
    { repo: settings() },
    { user: root, ip: null },
    {
      transport: "resend",
      fromAddress: "marketplace@acme.com",
      replyTo: "it-help@acme.com",
      contact: "it-help@acme.com",
      secret: "re_test_key",
    },
    { authSecret: TEST_SECRET, allowedHosts: new Set() },
  );
  await setPasswordResetPolicy(
    { repo: settings() },
    { user: root, ip: null },
    { enabled: true },
    async () => ({ mail: true, working: true, contact: true }),
  );
  // 190's challenge, on by default: off here, and its own test below.
  await settings().set(SIGN_UP_KEYS.challenge, "off", root.id, clock);
});
afterEach(() => t.cleanup());

describe("asking to reset a forgotten password (194)", () => {
  it("an active account with a password: a code by email, tied to the flow, which signs no one in", async () => {
    const id = await user("ana@acme.com");
    const asked = await request({ locale: "pt" });
    if (!asked.ok) throw new Error(asked.refusal);
    expect(asked.expiresAt).toEqual(new Date(clock.getTime() + 15 * 60_000));
    const [mail, ...rest] = await mails();
    expect(rest).toEqual([]);
    expect(mail).toMatchObject({
      template: "reset_code",
      to: "ana@acme.com",
      userId: id,
      locale: "pt",
    });
    expect(codeIn(mail?.text)).toMatch(/^\d{6}$/);
    // The row keeps only the token's SHA-256, the account, the step and the times.
    const [flow] = await flows();
    expect(flow).toMatchObject({
      token_hash: resetTokenHash(asked.token),
      user_id: id,
      step: "code",
    });
    expect(flow?.token_hash).toBe(createHash("sha256").update(asked.token).digest("hex"));
    expect(asked.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // The code is the flow's, never usable alone.
    const [code] = await codes();
    expect(code?.subject_id).toBe(flow?.id);
    // Nothing signs in.
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", id).execute(),
    ).toEqual([]);
    expect((await audits()).map((e) => [e.targetId, e.metadata])).toEqual([[id, { sent: "code" }]]);
  });

  it("normalises the address as sign-in does", async () => {
    await user("ana@acme.com");
    await request({ email: "  ANA@Acme.com " });
    expect((await mails()).map((m) => [m.template, m.to])).toEqual([
      ["reset_code", "ana@acme.com"],
    ]);
  });

  it("a root account: no code, the reset command instead", async () => {
    await request({ email: "root@acme.com" });
    const [mail, ...rest] = await mails();
    expect(rest).toEqual([]);
    expect(mail).toMatchObject({ template: "reset_root", to: "root@acme.com", userId: root.id });
    expect(mail?.text).toContain("reset-root-password");
    expect(codeIn(mail?.text)).toBe("");
    expect(await codes()).toEqual([]);
    expect((await flows())[0]?.user_id).toBeNull();
    expect((await audits()).map((e) => e.metadata)).toEqual([{ sent: "root" }]);
  });

  it("an account with no password: no code, the way it signs in", async () => {
    const id = await ssoUser("carla@acme.com");
    await request({ email: "carla@acme.com" });
    const [mail] = await mails();
    expect(mail).toMatchObject({ template: "reset_providers", userId: id });
    expect(mail?.text).toContain("Acme Entra");
    expect(await codes()).toEqual([]);
    expect((await flows())[0]?.user_id).toBeNull();
    expect((await audits()).map((e) => e.metadata)).toEqual([{ sent: "providers" }]);
  });

  it("an account Root only keeps off passwords: no code, the providers that are on", async () => {
    await ssoUser("carla@acme.com");
    await user("ana@acme.com");
    await settings().set(PASSWORD_SIGN_IN_POLICY_KEY, "root_only", root.id, clock);
    await request();
    const [mail] = await mails();
    expect(mail).toMatchObject({ template: "reset_providers", to: "ana@acme.com" });
    expect(mail?.text).toContain("Acme Entra");
    expect(await codes()).toEqual([]);
  });

  for (const [what, change] of [
    ["disabled", { disabled_at: "now" }],
    ["waiting for root's approval", { approval_pending_at: "now" }],
  ] as const)
    it(`a ${what} account: nothing is sent, the same page`, async () => {
      const id = await user("ana@acme.com");
      const at = toDbDate(clock, t.dialect);
      await t.db
        .updateTable("user")
        .set(Object.fromEntries(Object.keys(change).map((k) => [k, at])))
        .where("id", "=", id)
        .execute();
      const asked = await request();
      expect(asked).toMatchObject({ ok: true });
      expect(await mails()).toEqual([]);
      expect(await codes()).toEqual([]);
      expect((await flows())[0]?.user_id).toBeNull();
      expect((await audits()).map((e) => e.metadata)).toEqual([{ sent: "none" }]);
    });

  it("no account, or an erased one: nothing is sent and nothing is recorded, the same page", async () => {
    const id = await user("erased@acme.com");
    await t.db
      .updateTable("user")
      .set({ email: "erased-01k@erased.invalid", erased_at: toDbDate(clock, t.dialect) })
      .where("id", "=", id)
      .execute();
    for (const email of ["bob@acme.com", "erased@acme.com"]) {
      const asked = await request({ email });
      expect(asked).toMatchObject({ ok: true });
    }
    expect(await mails()).toEqual([]);
    expect(await codes()).toEqual([]);
    expect((await flows()).map((f) => f.user_id)).toEqual([null, null]);
    expect(await audits()).toEqual([]);
  });

  it("an account marked erased whose address is still its own: nothing sent, nothing recorded", async () => {
    // Erasure rewrites the address too (103); this holds even if a row were left half-erased.
    const id = await user("ana@acme.com");
    await t.db
      .updateTable("user")
      .set({ erased_at: toDbDate(clock, t.dialect) })
      .where("id", "=", id)
      .execute();
    expect(await request()).toMatchObject({ ok: true });
    expect(await mails()).toEqual([]);
    expect(await audits()).toEqual([]);
  });

  it("gives every row of the table the same answer: a token and the same expiry", async () => {
    await user("ana@acme.com");
    await ssoUser("carla@acme.com");
    const disabled = await user("dan@acme.com");
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(clock, t.dialect) })
      .where("id", "=", disabled)
      .execute();
    const answers = [];
    for (const email of [
      "ana@acme.com",
      "root@acme.com",
      "carla@acme.com",
      "dan@acme.com",
      "bob@acme.com",
    ]) {
      const asked = await request({ email });
      if (!asked.ok) throw new Error(asked.refusal);
      answers.push({ ok: asked.ok, expiresAt: asked.expiresAt, token: typeof asked.token });
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(await flows()).toHaveLength(5);
  });

  it("does the same work for an account and for no account: lookup, the limit's HMAC, the flow, one email", async () => {
    await user("ana@acme.com");
    /** The repository's calls, by name, in order, the transaction's included. */
    const recorded = (calls: string[]) => {
      const wrap = (repo: PasswordResetRepository): PasswordResetRepository =>
        new Proxy(repo, {
          get: (target, name: string) => {
            const value = target[name as keyof PasswordResetRepository];
            if (typeof value !== "function") return value;
            return (...args: unknown[]) => {
              calls.push(name);
              if (name === "transaction")
                return target.transaction((inner) =>
                  (args[0] as (r: PasswordResetRepository) => Promise<unknown>)(wrap(inner)),
                );
              return (value as (...a: unknown[]) => unknown).apply(target, args);
            };
          },
        });
      const base = deps();
      return { ...base, repo: wrap(base.repo) };
    };
    const consumed: string[][] = [];
    const counting = (d: reset.PasswordResetDeps): reset.PasswordResetDeps => ({
      ...d,
      limits: {
        ...d.limits,
        consume: (entries, now) => {
          consumed.push(entries.map((e) => e.limit.name));
          return d.limits.consume(entries, now);
        },
      },
    });
    const found: string[] = [];
    const missing: string[] = [];
    await request({ email: "ana@acme.com" }, counting(recorded(found)));
    later(61_000);
    await request({ email: "bob@acme.com" }, counting(recorded(missing)));
    const common = ["transaction", "findAccount", "passwordPolicy", "insertFlow"];
    for (const calls of [found, missing]) {
      expect(calls.filter((c) => common.includes(c))).toEqual(common);
      expect(calls.filter((c) => c === "queueMail" || c === "rehearseMail")).toHaveLength(1);
    }
    expect(found).toContain("queueMail");
    expect(missing).toContain("rehearseMail");
    // Only the code itself, and the audit of a real account, differ.
    const extra = (calls: string[]) =>
      calls.filter((c) => ![...common, "queueMail", "rehearseMail"].includes(c));
    expect(extra(found)).toEqual(["lockAccount", "endCodesOf", "issueCode", "recordAudit"]);
    expect(extra(missing)).toEqual([]);
    // Both took the per-address limit, which hashes the address.
    expect(consumed).toEqual([
      ["email-code-resend", "email-code-hourly"],
      ["email-code-resend", "email-code-hourly"],
    ]);
  });

  it("waits a minute before another email to the same address, whichever flow asks", async () => {
    await user("ana@acme.com");
    await request();
    later(1000);
    expect(await request()).toMatchObject({ ok: true });
    expect(await mails()).toHaveLength(1);
    expect(await codes()).toHaveLength(1);
    later(60_000);
    await request();
    expect(await mails()).toHaveLength(2);
  });

  it("holds the root's and the providers' answers to the same limits", async () => {
    await ssoUser("carla@acme.com");
    for (const email of ["root@acme.com", "carla@acme.com"])
      for (let i = 0; i < 4; i++) {
        await request({ email });
        later(61_000);
      }
    expect((await mails()).map((m) => m.template)).toEqual([
      "reset_root",
      "reset_root",
      "reset_root",
      "reset_providers",
      "reset_providers",
      "reset_providers",
    ]);
  });

  it("sends nothing to an account whose address the database only calls equal", async () => {
    // Stored with an accent: MySQL and MariaDB find it for `kate@`, the others don't.
    await user("kåte@acme.com");
    expect(await request({ email: "kate@acme.com" })).toMatchObject({ ok: true });
    expect(await mails()).toEqual([]);
    expect(await codes()).toEqual([]);
    expect(await audits()).toEqual([]);
    expect((await flows())[0]?.user_id).toBeNull();
  });

  // The database servers only: each in-memory SQLite connection is its own database.
  it.skipIf(!process.env.TEST_DATABASE_URL)("requests at once leave one live code", async () => {
    await user("ana@acme.com");
    // A minute apart for the limits, all at once for the database.
    const d = deps();
    const asks = [0, 1, 2].map((i) =>
      reset.requestPasswordReset(
        { ...d, now: () => new Date(clock.getTime() + i * 61_000) },
        form(),
      ),
    );
    await Promise.all(asks);
    const live = (await codes()).filter((c) => c.consumed_at === null);
    expect(live).toHaveLength(1);
  });

  it("a second request ends the first code: only the newest works", async () => {
    await user("ana@acme.com");
    await request();
    later(61_000);
    await request();
    const [first, second] = await codes();
    expect(first?.consumed_at).not.toBeNull();
    expect(second?.consumed_at).toBeNull();
    expect(await flows()).toHaveLength(2);
  });

  it("sends at most 3 emails an hour to an address, with the same page after", async () => {
    await user("ana@acme.com");
    for (let i = 0; i < 4; i++) {
      expect(await request()).toMatchObject({ ok: true });
      later(61_000);
    }
    expect(await mails()).toHaveLength(3);
    expect((await audits()).map((e) => e.metadata.sent)).toEqual([
      "limited",
      "code",
      "code",
      "code",
    ]);
    // An hour after the first, another goes.
    later(60 * 60_000);
    await request();
    expect(await mails()).toHaveLength(4);
  });

  it("takes 10 requests an hour from one IP, then refuses before any lookup", async () => {
    await user("ana@acme.com");
    for (let i = 0; i < RESET_REQUEST_IP_LIMIT.max; i++) {
      expect(await request({ ip: "203.0.113.9", email: `x${i}@acme.com` })).toMatchObject({
        ok: true,
      });
    }
    expect(await request({ ip: "203.0.113.9" })).toEqual({ ok: false, refusal: "limited" });
    expect(await request({ ip: "198.51.100.7" })).toMatchObject({ ok: true });
  });

  it("a bot (the honeypot filled, or too fast) gets the same page and nothing", async () => {
    await user("ana@acme.com");
    expect(await request({ honeypot: "http://spam.example" })).toMatchObject({ ok: true });
    expect(await request({ stamp: formStamp(TEST_SECRET, clock) })).toMatchObject({ ok: true });
    expect(await mails()).toEqual([]);
    expect(await codes()).toEqual([]);
    expect((await audits()).map((e) => e.metadata)).toEqual([{ sent: "bot" }, { sent: "bot" }]);
  });

  it("asks for 190's solved challenge when it's on, once each", async () => {
    await user("ana@acme.com");
    await settings().set(SIGN_UP_KEYS.challenge, "on", root.id, clock);
    expect(await request()).toEqual({ ok: false, refusal: "challenge" });
    const challenge = issueChallenge(TEST_SECRET, clock, 20);
    let number = 0;
    while (
      createHash("sha256").update(`${challenge.salt}${number}`).digest("hex") !==
      challenge.challenge
    )
      number++;
    const answer = JSON.stringify({ challenge, number });
    expect(await request({ challenge: answer })).toMatchObject({ ok: true });
    later(61_000);
    expect(
      await request({
        challenge: answer,
        stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
      }),
    ).toEqual({ ok: false, refusal: "challenge" });
    expect(await mails()).toHaveLength(1);
  });

  it("refuses a stale form and what isn't an address, before any lookup", async () => {
    expect(
      await request({ stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 2 * 3600_000)) }),
    ).toEqual({ ok: false, refusal: "stale" });
    expect(await request({ email: "not an address" })).toEqual({
      ok: false,
      refusal: "invalid_email",
    });
    expect(await flows()).toEqual([]);
  });

  it("is closed while the setting is off or email has stopped", async () => {
    await user("ana@acme.com");
    await setPasswordResetPolicy(
      { repo: settings() },
      { user: root, ip: null },
      { enabled: false },
      async () => ({ mail: true, working: true, contact: true }),
    );
    expect(await request()).toEqual({ ok: false, refusal: "closed" });
    await setPasswordResetPolicy(
      { repo: settings() },
      { user: root, ip: null },
      { enabled: true },
      async () => ({ mail: true, working: true, contact: true }),
    );
    await stopSending({ db: t.db, dialect: t.dialect }, { user: root, ip: null });
    expect(await request()).toEqual({ ok: false, refusal: "closed" });
    expect(await flows()).toEqual([]);
  });
});

describe("the answer's time (194, SPEC 'Same time')", () => {
  it("answers every request at the same moment after it began, found or not, refused or not", async () => {
    await user("ana@acme.com");
    const floor = 150;
    const timed = async (fields: Partial<reset.ResetRequest>) => {
      const started = performance.now();
      await request(fields, deps(floor));
      later(61_000);
      return performance.now() - started;
    };
    for (const fields of [
      { email: "ana@acme.com" },
      { email: "bob@acme.com" },
      { email: "root@acme.com" },
      { email: "not an address" },
    ])
      expect(await timed(fields)).toBeGreaterThanOrEqual(floor - 1);
  });

  it("waits only what's left of the floor", async () => {
    const waited: number[] = [];
    await reset.requestPasswordReset(
      { ...deps(400), wait: async (ms) => void waited.push(ms) },
      form(),
    );
    expect(waited).toHaveLength(1);
    expect(waited[0]).toBeGreaterThan(300);
    expect(waited[0]).toBeLessThanOrEqual(400);
    expect(reset.RESET_ANSWER_MS).toBe(400);
  });
});
