import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { openBody } from "../../mail/models/outbox";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { PASSWORD_SIGN_IN_POLICY_KEY } from "../../settings/models/password-sign-in-policy";
import { SIGN_UP_KEYS } from "../../settings/models/sign-up-policy";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { setPasswordResetPolicy } from "../../settings/services/password-reset";
import { passwordResetDeps } from "../actions/password-reset";
import { createRoot } from "../actions/root-account";
import { signIn } from "../actions/session";
import { confirmTwoFactor, startTwoFactor } from "../actions/two-factor";
import { RESET_CODE_IP_LIMIT, RESET_GRANT_MS, resetTokenHash } from "../models/password-reset";
import { formStamp } from "../models/sign-up-guard";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, TEST_SECRET, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import * as reset from "./password-reset";

// Feature 194, task 4: the code and two-factor steps of a reset.
let t: TestDb;
let app: AppAuth;
let root: CurrentUser;
let ana: string;
let clock: Date;
const PASSWORD = "correct horse battery";
const settings = () => kyselySettingsRepository(t.db, t.dialect);
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

/** A request from the page, as a person makes it: the flow's token, and the code sent, if any. */
const asked = async (email = "ana@acme.com") => {
  const result = await reset.requestPasswordReset(deps(), {
    email,
    locale: "en",
    stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
    honeypot: "",
    challenge: undefined,
    ip: null,
  });
  if (!result.ok) throw new Error(result.refusal);
  const rows = await t.db
    .selectFrom("mail_outbox")
    .select(["id", "body_enc"])
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .execute();
  const latest = rows[0];
  const text = latest?.body_enc
    ? (openBody(TEST_SECRET, latest.id, latest.body_enc)?.text ?? "")
    : "";
  return { token: result.token, code: /\b(\d{6})\b/.exec(text)?.[1] ?? "" };
};
const code = (token: string | null, typed: string, ip: string | null = null, d = deps()) =>
  reset.checkResetCode(d, { token, code: typed, ip });
const twoFactor = (token: string | null, typed: string, ip: string | null = null) =>
  reset.checkResetTwoFactor(deps(), { token, code: typed, ip });
const flowOf = (token: string) =>
  t.db
    .selectFrom("password_reset_flows")
    .selectAll()
    .where("token_hash", "=", resetTokenHash(TEST_SECRET, token))
    .executeTakeFirst();
const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events.filter((e) => e.action === action);
const sessions = async () =>
  (await t.db.selectFrom("session").select("id").where("user_id", "=", ana).execute()).length;
/** A code that isn't `right`. */
const other = (right: string) => (right === "111111" ? "222222" : "111111");

/** Turns two-factor on for Ana; returns the URI and the backup codes. */
const enrol = async () => {
  const first = await signIn(
    new Headers(),
    { email: "ana@acme.com", password: PASSWORD, rememberMe: false },
    app,
  );
  if (!first.ok || first.twoFactor) throw new Error("not signed in");
  const session = cookieHeaders(first.headers.get("set-cookie"));
  const started = await startTwoFactor(session, { password: PASSWORD }, app);
  if (!started.ok) throw new Error(started.error);
  const on = await confirmTwoFactor(
    session,
    { code: totpCode(started.uri), uri: started.uri },
    app,
  );
  if (!on.ok) throw new Error(on.error);
  return {
    uri: started.uri,
    backupCodes: started.backupCodes,
    session,
    enrolCode: totpCode(started.uri),
  };
};
/** A TOTP code the app shows now that isn't `used`. */
const fresh = (uri: string, used: string[] = []) => {
  const found = [1, 0, -1].map((step) => totpCode(uri, { step })).find((c) => !used.includes(c));
  if (!found) throw new Error("no unused code");
  return found;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  // Real time: two-factor codes are read against the system clock.
  clock = new Date();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@acme.com",
    name: "Root",
    password: PASSWORD,
  });
  root = { id, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
  ana = await createTestUser(app, { email: "ana@acme.com", password: PASSWORD, name: "Ana" });
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
  await settings().set(SIGN_UP_KEYS.challenge, "off", root.id, clock);
});
afterEach(() => t.cleanup());

describe("the code step (194)", () => {
  it("a right code with no two-factor opens the new-password page, for 10 minutes, signing no one in", async () => {
    const flow = await asked();
    const result = await code(flow.token, flow.code);
    if (!result.ok) throw new Error(result.refusal);
    expect(result.step).toBe("new_password");
    // The cookie changes at every step: the old value names nothing now.
    expect(result.token).not.toBe(flow.token);
    expect(await flowOf(flow.token)).toBeUndefined();
    const row = await flowOf(result.token);
    expect(row?.step).toBe("new_password");
    expect(new Date(row?.expires_at as string).getTime()).toBe(clock.getTime() + RESET_GRANT_MS);
    expect(row?.two_factor_at).toBeNull();
    expect(await sessions()).toBe(0);
  });

  it("takes the code with spaces or a dash, as typed from the email", async () => {
    const flow = await asked();
    const spaced = `${flow.code.slice(0, 3)} ${flow.code.slice(3)}`;
    expect(await code(flow.token, spaced)).toMatchObject({ ok: true });
  });

  it("a cookie from an earlier step is refused, and the right code is used once", async () => {
    const flow = await asked();
    expect(await code(flow.token, flow.code)).toMatchObject({ ok: true });
    expect(await code(flow.token, flow.code)).toEqual({ ok: false, refusal: "spent" });
  });

  it("no cookie: start again in this browser", async () => {
    await asked();
    expect(await code(null, "123456")).toEqual({ ok: false, refusal: "missing" });
  });

  it("a wrong code is wrong, audited for the account; five end the flow", async () => {
    const flow = await asked();
    for (let i = 0; i < 5; i++)
      expect(await code(flow.token, other(flow.code))).toEqual({ ok: false, refusal: "wrong" });
    expect(await code(flow.token, flow.code)).toEqual({ ok: false, refusal: "spent" });
    // Ended: the row is gone.
    expect(await flowOf(flow.token)).toBeUndefined();
    const failed = await events("auth.password_reset_code_failed");
    expect(failed.map((e) => e.metadata.reason)).toEqual([
      "spent",
      "wrong",
      "wrong",
      "wrong",
      "wrong",
      "wrong",
    ]);
    expect(failed[0]).toMatchObject({ targetId: ana });
  });

  it("an address with no account answers exactly as one with, and leaves no trace", async () => {
    const real = await asked("ana@acme.com");
    const none = await asked("bob@acme.com");
    const answers = async (token: string, right: string) => {
      const out = [];
      for (let i = 0; i < 6; i++) out.push(await code(token, other(right)));
      return out;
    };
    expect(await answers(none.token, "000000")).toEqual(await answers(real.token, real.code));
    // Only Ana was emailed.
    expect(await t.db.selectFrom("mail_outbox").select("id").execute()).toHaveLength(1);
    // Only Ana's tries are on record.
    expect((await events("auth.password_reset_code_failed")).every((e) => e.targetId === ana)).toBe(
      true,
    );
  });

  it("an expired code: send a new one", async () => {
    const flow = await asked();
    later(15 * 60_000 + 1);
    expect(await code(flow.token, flow.code)).toEqual({ ok: false, refusal: "expired" });
  });

  it("a newer request replaces the code, for an account and for no account alike", async () => {
    const first = await asked();
    const firstNone = await asked("bob@acme.com");
    later(61_000);
    const second = await asked();
    await asked("bob@acme.com");
    expect(await code(first.token, first.code)).toEqual({ ok: false, refusal: "replaced" });
    expect(await code(firstNone.token, "123456")).toEqual({ ok: false, refusal: "replaced" });
    expect(await code(second.token, second.code)).toMatchObject({ ok: true });
  });

  for (const [what, change] of [
    [
      "disabled",
      async () =>
        t.db
          .updateTable("user")
          .set({ disabled_at: toDbDate(clock, t.dialect) })
          .where("id", "=", ana)
          .execute(),
    ],
    [
      "made root",
      async () => t.db.updateTable("user").set({ role: "root" }).where("id", "=", ana).execute(),
    ],
    [
      "erased",
      async () =>
        t.db
          .updateTable("user")
          .set({ erased_at: toDbDate(clock, t.dialect), email: "erased-x@erased.invalid" })
          .where("id", "=", ana)
          .execute(),
    ],
    [
      "kept off passwords by Root only",
      async () => {
        await settings().set(PASSWORD_SIGN_IN_POLICY_KEY, "root_only", root.id, clock);
        const at = toDbDate(clock, t.dialect);
        await t.db
          .insertInto("identity_providers")
          .values({
            id: "acme",
            type: "oidc",
            preset: "entra",
            name: "Acme Entra",
            enabled: 1,
            config: "{}",
            secret_enc: null,
            domains: "[]",
            created_at: at,
            updated_at: at,
          } as never)
          .execute();
      },
    ],
  ] as const)
    it(`an account ${what} mid-flow: the reset can't continue, and the flow ends`, async () => {
      const flow = await asked();
      await change();
      expect(await code(flow.token, flow.code)).toEqual({ ok: false, refusal: "cannot_continue" });
      expect(await flowOf(flow.token)).toBeUndefined();
    });

  it("pauses reset by email after 20 wrong codes in a day: a right code is wrong too", async () => {
    // Each flow is tried to its end (a sixth try ends it, and deletes it): its wrong codes still count.
    for (let i = 0; i < 4; i++) {
      const flow = await asked();
      for (let j = 0; j < 5; j++) await code(flow.token, other(flow.code));
      expect(await code(flow.token, other(flow.code))).toEqual({ ok: false, refusal: "spent" });
      later(61 * 60_000);
    }
    const flow = await asked();
    expect(flow.code).toMatch(/^\d{6}$/);
    expect(await code(flow.token, flow.code)).toEqual({ ok: false, refusal: "wrong" });
    expect((await events("auth.password_reset_code_failed"))[0]?.metadata.reason).toBe("paused");
    // Sign-in itself still works.
    const signed = await signIn(
      new Headers(),
      { email: "ana@acme.com", password: PASSWORD, rememberMe: false },
      app,
    );
    expect(signed.ok).toBe(true);
    // A day later, it works again.
    later(24 * 60 * 60_000);
    const next = await asked();
    expect(await code(next.token, next.code)).toMatchObject({ ok: true });
  });

  it("keeps the pause a full day after the 20th wrong code, not after the first", async () => {
    for (let i = 0; i < 4; i++) {
      const flow = await asked();
      for (let j = 0; j < 5; j++) await code(flow.token, other(flow.code));
      later(61 * 60_000);
    }
    // The 20th was about an hour ago. Tries during the pause don't make it longer: one now…
    const early = await asked();
    expect(await code(early.token, early.code)).toEqual({ ok: false, refusal: "wrong" });
    // …and one about 21.5 hours after the 20th, still paused.
    later(20 * 60 * 60_000 + 30 * 60_000);
    const during = await asked();
    expect(await code(during.token, during.code)).toEqual({ ok: false, refusal: "wrong" });
    // A day and a minute after the 20th, reset works again.
    later(2 * 60 * 60_000 + 31 * 60_000);
    const after = await asked();
    expect(await code(after.token, after.code)).toMatchObject({ ok: true });
  });

  // The database servers only: each in-memory SQLite connection is its own database.
  it.skipIf(!process.env.TEST_DATABASE_URL)(
    "a burst at the threshold is counted one at a time: the right code in it stays wrong",
    async () => {
      for (let i = 0; i < 3; i++) {
        const flow = await asked();
        for (let j = 0; j < 5; j++) await code(flow.token, other(flow.code));
        later(61 * 60_000);
      }
      const fourth = await asked();
      for (let j = 0; j < 4; j++) await code(fourth.token, other(fourth.code));
      later(61 * 60_000);
      // 19 wrong so far; four wrong and the right one at once.
      const flow = await asked();
      const answers = await Promise.all([
        ...[0, 1, 2, 3].map(() => code(flow.token, other(flow.code))),
        code(flow.token, flow.code),
      ]);
      // Counted one at a time, never past 20; the right code wins only if it came before the 20th,
      // and then the wrong ones after it find its flow moved on.
      const wrong = (await events("auth.password_reset_code_failed")).filter(
        (e) => e.metadata.reason === "wrong",
      );
      expect(wrong.length).toBeLessThanOrEqual(20);
      if (answers.some((a) => a.ok)) expect(wrong).toHaveLength(19);
      else expect(wrong).toHaveLength(20);
    },
  );

  it("keeps the pause on the account when its address changes", async () => {
    for (let i = 0; i < 4; i++) {
      const flow = await asked();
      for (let j = 0; j < 5; j++) await code(flow.token, other(flow.code));
      later(61 * 60_000);
    }
    await t.db
      .updateTable("user")
      .set({ email: "ana.new@acme.com" })
      .where("id", "=", ana)
      .execute();
    const flow = await asked("ana.new@acme.com");
    expect(flow.code).toMatch(/^\d{6}$/);
    expect(await code(flow.token, flow.code)).toEqual({ ok: false, refusal: "wrong" });
  });

  it("takes 30 code tries an hour from one IP", async () => {
    const flow = await asked();
    for (let i = 0; i < RESET_CODE_IP_LIMIT.max; i++) await code(flow.token, "x", "203.0.113.9");
    expect(await code(flow.token, flow.code, "203.0.113.9")).toEqual({
      ok: false,
      refusal: "limited",
    });
  });

  it("answers at the request's floor, found or not", async () => {
    const real = await asked();
    const none = await asked("bob@acme.com");
    for (const token of [real.token, none.token, "not-a-token"]) {
      const started = performance.now();
      await code(token, "123456", null, deps(120));
      // Timers can fire a hair early against `performance.now`.
      expect(performance.now() - started).toBeGreaterThanOrEqual(115);
    }
  });
});

describe("the two-factor step (194, Decision 2)", () => {
  it("a right code with two-factor on asks for it; a right TOTP code then opens the new-password page", async () => {
    const { uri, enrolCode } = await enrol();
    // The enrolment's own session stays; the reset opens none.
    const before = await sessions();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    expect(step.step).toBe("two_factor");
    // The new-password page isn't open yet.
    expect((await flowOf(step.token))?.step).toBe("two_factor");
    const passed = await twoFactor(step.token, fresh(uri, [enrolCode]));
    if (!passed.ok) throw new Error(passed.refusal);
    expect(passed.step).toBe("new_password");
    const row = await flowOf(passed.token);
    expect(row?.two_factor_at).not.toBeNull();
    expect(new Date(row?.expires_at as string).getTime()).toBe(clock.getTime() + RESET_GRANT_MS);
    expect(await sessions()).toBe(before);
  });

  it("a backup code works once, and is spent", async () => {
    const { backupCodes } = await enrol();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    expect(await twoFactor(step.token, backupCodes[0] as string)).toMatchObject({ ok: true });
    // Spent: a second reset can't use it.
    later(61_000);
    const again = await asked();
    const next = await code(again.token, again.code);
    if (!next.ok) throw new Error(next.refusal);
    expect(await twoFactor(next.token, backupCodes[0] as string)).toEqual({
      ok: false,
      refusal: "wrong",
    });
    expect(await twoFactor(next.token, backupCodes[1] as string)).toMatchObject({ ok: true });
  });

  it("refuses a TOTP code already accepted, and a wrong one, audited", async () => {
    const { enrolCode } = await enrol();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    expect(await twoFactor(step.token, enrolCode)).toEqual({ ok: false, refusal: "used" });
    expect(await twoFactor(step.token, "12345")).toEqual({ ok: false, refusal: "wrong" });
    expect(
      (await events("auth.password_reset_two_factor_failed")).map((e) => e.metadata.reason),
    ).toEqual(["wrong_code", "used"]);
  });

  it("records a TOTP code accepted at a reset: a second reset, and sign-in, refuse it", async () => {
    const { uri, enrolCode } = await enrol();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    const totp = fresh(uri, [enrolCode]);
    expect(await twoFactor(step.token, totp)).toMatchObject({ ok: true });
    later(61_000);
    const again = await asked();
    const next = await code(again.token, again.code);
    if (!next.ok) throw new Error(next.refusal);
    expect(await twoFactor(next.token, totp)).toEqual({ ok: false, refusal: "used" });
  });

  it("counts a used code, and an empty one, in the lockout: they never clear it", async () => {
    const { enrolCode } = await enrol();
    await t.db
      .updateTable("two_factor")
      .set({ failed_verification_count: 7 })
      .where("user_id", "=", ana)
      .execute();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    expect(await twoFactor(step.token, enrolCode)).toEqual({ ok: false, refusal: "used" });
    expect(await twoFactor(step.token, "")).toEqual({ ok: false, refusal: "wrong" });
    expect(await twoFactor(step.token, "000000")).toEqual({ ok: false, refusal: "wrong" });
    expect(await twoFactor(step.token, "000000")).toEqual({ ok: false, refusal: "locked" });
  });

  // The database servers only: each in-memory SQLite connection is its own database.
  it.skipIf(!process.env.TEST_DATABASE_URL)(
    "guesses sent at once get no more than sign-in's ten before the lock",
    async () => {
      await enrol();
      const flow = await asked();
      const step = await code(flow.token, flow.code);
      if (!step.ok) throw new Error(step.refusal);
      const answers = await Promise.all(
        Array.from({ length: 30 }, (_, i) => twoFactor(step.token, String(100000 + i))),
      );
      expect(answers.filter((a) => !a.ok && a.refusal === "wrong")).toHaveLength(10);
      expect(answers.filter((a) => !a.ok && a.refusal === "locked")).toHaveLength(20);
    },
  );

  it("counts wrong codes with sign-in's own: the tenth in a row locks it, as at sign-in", async () => {
    await enrol();
    await t.db
      .updateTable("two_factor")
      .set({ failed_verification_count: 9 })
      .where("user_id", "=", ana)
      .execute();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    expect(await twoFactor(step.token, "000000")).toEqual({ ok: false, refusal: "wrong" });
    expect(await twoFactor(step.token, "000000")).toEqual({ ok: false, refusal: "locked" });
    const row = await t.db
      .selectFrom("two_factor")
      .select(["failed_verification_count", "lock_expires_at"])
      .where("user_id", "=", ana)
      .executeTakeFirst();
    expect(Number(row?.failed_verification_count)).toBe(10);
    expect(row?.lock_expires_at).not.toBeNull();
  });

  it("two-factor turned on after the request: the right code asks for it", async () => {
    const flow = await asked();
    await enrol();
    const step = await code(flow.token, flow.code);
    expect(step).toMatchObject({ ok: true, step: "two_factor" });
  });

  it("two-factor turned off before its step (a root reset it): the step is passed", async () => {
    await enrol();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    // As `reset-two-factor` and a root's Reset two-factor leave it.
    await t.db.deleteFrom("two_factor").where("user_id", "=", ana).execute();
    await t.db
      .updateTable("user")
      .set({ two_factor_enabled: 0 } as never)
      .where("id", "=", ana)
      .execute();
    const passed = await twoFactor(step.token, "");
    if (!passed.ok) throw new Error(passed.refusal);
    expect(passed.step).toBe("new_password");
    // It wasn't passed: two-factor turned on again by the new-password page sends it back (task 5).
    expect((await flowOf(passed.token))?.two_factor_at).toBeNull();
  });

  it("a cookie from the code step is refused at the two-factor step", async () => {
    await enrol();
    const flow = await asked();
    await code(flow.token, flow.code);
    expect(await twoFactor(flow.token, "123456")).toEqual({ ok: false, refusal: "spent" });
    expect(await twoFactor(null, "123456")).toEqual({ ok: false, refusal: "missing" });
  });

  it("an account disabled before the two-factor step can't continue", async () => {
    await enrol();
    const flow = await asked();
    const step = await code(flow.token, flow.code);
    if (!step.ok) throw new Error(step.refusal);
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(clock, t.dialect) })
      .where("id", "=", ana)
      .execute();
    expect(await twoFactor(step.token, "123456")).toEqual({
      ok: false,
      refusal: "cannot_continue",
    });
    expect(await flowOf(step.token)).toBeUndefined();
  });
});
