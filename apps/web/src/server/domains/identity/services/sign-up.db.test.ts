import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { openBody } from "../../mail/models/outbox";
import { saveMailSetup } from "../../mail/services/mail-setup";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { type SignUpInput, setSignUpPolicy } from "../../settings/services/sign-up";
import { createRoot } from "../actions/root-account";
import { signUpDeps } from "../actions/sign-up";
import { formStamp, issueChallenge } from "../models/sign-up-guard";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import type { SignUpRepository } from "../repositories/sign-up-repository";
import { TEST_SECRET, testAppAuth } from "../testing/test-auth";
import * as signUp from "./sign-up";

let t: TestDb;
let app: AppAuth;
let root: CurrentUser;
let clock: Date;
const PASSWORD = "correct horse battery";
const READY = { mail: true, contact: true, password: true };
const settings = () => kyselySettingsRepository(t.db, t.dialect);
const deps = () =>
  signUpDeps(app, {
    authSecret: TEST_SECRET,
    publicUrl: "https://marketplace.acme.com",
    now: () => clock,
  });
const later = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

const policy = (input: Partial<SignUpInput> = {}) =>
  setSignUpPolicy(
    { repo: settings(), now: () => clock },
    { user: root, ip: null },
    {
      enabled: true,
      domainsMode: "list",
      domains: "acme.com",
      approval: false,
      blockThrowaway: true,
      codeMinutes: "15",
      challenge: false,
      termsUrl: "",
      termsVersion: "",
      ...input,
    },
    READY,
  );

/** The form as the page draws it: its stamp from 5 seconds ago. */
const form = (fields: Partial<signUp.SignUpRequest> = {}): Omit<signUp.SignUpRequest, "ip"> => ({
  name: "Ana Lima",
  email: "ana@acme.com",
  password: PASSWORD,
  termsAccepted: false,
  termsVersion: "",
  locale: "pt",
  stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
  honeypot: "",
  challenge: undefined,
  previous: null,
  ...fields,
});
const request = (fields: Partial<signUp.SignUpRequest> = {}) =>
  signUp.requestSignUp(deps(), { ip: null, ...form(fields) });
/** A sign-up that reached the code page. */
const started = async (fields: Partial<signUp.SignUpRequest> = {}) => {
  const result = await request(fields);
  if (!result.ok || !("id" in result)) throw new Error(`refused: ${JSON.stringify(result)}`);
  return result;
};

/** The emails queued, opened, newest last. */
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
const audits = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, { size: 100 })).events.filter((e) => e.action === action);

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date("2026-11-21T12:00:00.000Z");
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
  await policy();
});
afterEach(() => t.cleanup());

describe("signing up (190)", () => {
  it("a new address: a code by email, then the account, proven, in its language, never root", async () => {
    const asked = await started();
    // Nothing in `user` yet.
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "ana@acme.com").execute(),
    ).toEqual([]);
    const [mail] = await mails();
    expect(mail).toMatchObject({
      template: "sign_up_code",
      to: "ana@acme.com",
      userId: null,
      locale: "pt",
    });
    const code = codeIn(mail?.text);
    expect(code).toMatch(/^\d{6}$/);
    expect(await signUp.codePage(deps(), asked.id)).toMatchObject({ email: "ana@acme.com" });

    later(30_000);
    expect(await signUp.enterSignUpCode(deps(), { id: asked.id, code, ip: null })).toEqual({
      ok: true,
      email: "ana@acme.com",
      waiting: false,
    });
    const user = await t.db
      .selectFrom("user")
      .selectAll()
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    expect(user).toMatchObject({
      name: "Ana Lima",
      role: "user",
      locale: "pt",
      approval_pending_at: null,
    });
    // SQLite and MySQL keep 1, PostgreSQL true.
    expect(Boolean(Number(user.email_verified))).toBe(true);
    expect(user.signed_up_at).not.toBeNull();
    const memberships = await t.db
      .selectFrom("workspace_members")
      .select(["workspace_id", "role"])
      .where("user_id", "=", user.id)
      .execute();
    expect(memberships).toContainEqual({ workspace_id: GLOBAL_WORKSPACE_ID, role: "user" });
    // And a personal workspace of its own (114).
    expect(memberships).toHaveLength(2);
    // Its password works through the one sign-in path; the pending row is gone.
    const account = await t.db
      .selectFrom("account")
      .select("password")
      .where("user_id", "=", user.id)
      .executeTakeFirstOrThrow();
    expect(await deps().hasher.verify(account.password ?? "", PASSWORD)).toBe(true);
    expect(await t.db.selectFrom("pending_sign_ups").select("id").execute()).toEqual([]);
    const [created] = await audits("user.signed_up");
    expect(created).toMatchObject({
      actorId: user.id,
      metadata: { email: "ana@acme.com", how: "password", approval: false },
    });
    expect((await audits("auth.sign_up_requested"))[0]?.metadata).toEqual({
      email: "ana@acme.com",
      outcome: "sent",
    });
  });

  it("records that a sign-up made the account (191)", async () => {
    const asked = await started();
    const [mail] = await mails();
    later(30_000);
    await signUp.enterSignUpCode(deps(), { id: asked.id, code: codeIn(mail?.text), ip: null });
    const user = await t.db
      .selectFrom("user")
      .select("created_via")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    expect(user.created_via).toBe("sign_up");
  });

  it("an existing address: the same answer, its owner told, and no code that works", async () => {
    await kyselyIdentityRepository(t.db, t.dialect).createUserWithPassword(
      { email: "ana@acme.com", name: "Ana", role: "user", createdVia: "root", passwordHash: "x" },
      clock,
    );
    const asked = await started();
    expect(await signUp.codePage(deps(), asked.id)).toMatchObject({ email: "ana@acme.com" });
    const [mail] = await mails();
    expect(mail).toMatchObject({ template: "sign_up_existing", to: "ana@acme.com" });
    expect(mail?.userId).not.toBeNull();
    expect(codeIn(mail?.text)).toBe("");
    // Even the code it was issued (never sent) is only wrong.
    for (const code of ["000000", "123456"])
      expect(await signUp.enterSignUpCode(deps(), { id: asked.id, code, ip: null })).toEqual({
        ok: false,
        refusal: "wrong",
      });
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "ana@acme.com").execute(),
    ).toHaveLength(1);
    expect((await audits("auth.sign_up_requested"))[0]?.metadata).toMatchObject({
      outcome: "existing",
    });
  });

  it("an existing address whose account goes meanwhile: Send a new code sends nothing", async () => {
    const existing = await kyselyIdentityRepository(t.db, t.dialect).createUserWithPassword(
      { email: "ana@acme.com", name: "Ana", role: "user", createdVia: "root", passwordHash: "x" },
      clock,
    );
    const asked = await started();
    // As erasing does (103): the address is free.
    await t.db
      .updateTable("user")
      .set({ email: `deleted-user-${existing}@ronne.invalid` })
      .where("id", "=", existing)
      .execute();
    later(61_000);
    expect(await signUp.resendSignUpCode(deps(), { id: asked.id, ip: null })).toEqual({ ok: true });
    // No code it could send would work: none is sent.
    expect((await mails()).map((m) => m.template)).toEqual(["sign_up_existing"]);
  });

  it("a domain that isn't allowed is said at once, and nothing is sent", async () => {
    expect(await request({ email: "ana@other.com" })).toEqual({
      ok: false,
      refusal: "domain_not_allowed",
      field: "email",
    });
    expect(await mails()).toEqual([]);
    await policy({ domainsMode: "any", domains: "" });
    expect(await request({ email: "ana@mailinator.com" })).toMatchObject({
      refusal: "domain_not_allowed",
    });
  });

  it("closed while pending: the code page refuses and the sign-up ends", async () => {
    const asked = await started();
    const code = codeIn((await mails())[0]?.text);
    await policy({ domains: "acme.co.uk" });
    expect(await signUp.enterSignUpCode(deps(), { id: asked.id, code, ip: null })).toEqual({
      ok: false,
      refusal: "closed",
    });
    expect(await t.db.selectFrom("pending_sign_ups").select("id").execute()).toEqual([]);
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "ana@acme.com").execute(),
    ).toEqual([]);

    const again = await started({ email: "bo@acme.co.uk" });
    await policy({ enabled: false, domains: "acme.co.uk" });
    expect(await request({ email: "bo@acme.co.uk" })).toEqual({ ok: false, refusal: "closed" });
    expect(
      await signUp.enterSignUpCode(deps(), {
        id: again.id,
        code: codeIn((await mails())[1]?.text),
        ip: null,
      }),
    ).toEqual({ ok: false, refusal: "closed" });
  });

  it("two sign-ups for one address: the first right code makes the account, the second hears it exists", async () => {
    const first = await started();
    later(1000);
    const second = await started();
    const [a, b] = (await mails()).map((m) => codeIn(m.text));
    const [one, two] = await Promise.all([
      signUp.enterSignUpCode(deps(), { id: first.id, code: a, ip: null }),
      signUp.enterSignUpCode(deps(), { id: second.id, code: b, ip: null }),
    ]);
    const results = [one, two].map((r) => (r.ok ? "ok" : r.refusal)).sort();
    expect(results).toEqual(["exists", "ok"]);
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "ana@acme.com").execute(),
    ).toHaveLength(1);
  });

  it("an account made meanwhile (by root, SCIM or a provider): exists, and the sign-up ends", async () => {
    const asked = await started();
    const code = codeIn((await mails())[0]?.text);
    await kyselyIdentityRepository(t.db, t.dialect).createUserWithPassword(
      { email: "ana@acme.com", name: "Ana", role: "user", createdVia: "root", passwordHash: "x" },
      clock,
    );
    expect(await signUp.enterSignUpCode(deps(), { id: asked.id, code, ip: null })).toEqual({
      ok: false,
      refusal: "exists",
    });
    expect(await t.db.selectFrom("pending_sign_ups").select("id").execute()).toEqual([]);
  });

  it("a lookalike address is refused before anything: not plain ASCII, or not one address", async () => {
    await kyselyIdentityRepository(t.db, t.dialect).createUserWithPassword(
      { email: "kate@acme.com", name: "Kate", role: "user", createdVia: "root", passwordHash: "x" },
      clock,
    );
    for (const email of [
      "kåte@acme.com",
      "kate​@acme.com",
      "ana@acme.com ",
      "a@b@acme.com",
      "ana@acme.com/x",
    ])
      expect(await request({ email }), email).toEqual({
        ok: false,
        refusal: "invalid_email",
        field: "email",
      });
    expect(await mails()).toEqual([]);
    expect(signUp.signUpEmail(" Ana@ACME.com ")).toBe("ana@acme.com");
  });

  it("a bot sees success: the same code page, a sign-up that can't become an account, no email", async () => {
    // Each made at its moment: the clock moves a minute a round.
    const bots = [
      () => ({ honeypot: "https://spam.example" }),
      () => ({ stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 500)) }),
      () => ({ stamp: "123.abc" }),
    ];
    for (const [i, fields] of bots.entries()) {
      const email = `bot${i}@acme.com`;
      const asked = await started({ ...fields(), email });
      expect(await signUp.codePage(deps(), asked.id)).toMatchObject({ email });
      // Its code was never sent, and even the right one is only wrong.
      expect(
        await signUp.enterSignUpCode(deps(), { id: asked.id, code: "000000", ip: null }),
      ).toEqual({
        ok: false,
        refusal: "wrong",
      });
      later(61_000);
      expect(await signUp.resendSignUpCode(deps(), { id: asked.id, ip: null })).toEqual({
        ok: true,
      });
    }
    expect(await mails()).toEqual([]);
    const rows = await t.db.selectFrom("pending_sign_ups").select("password_hash").execute();
    expect(rows.map((r) => r.password_hash)).toEqual([null, null, null]);
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "ana@acme.com").execute(),
    ).toEqual([]);
    expect((await audits("auth.sign_up_requested")).map((e) => e.metadata.outcome)).toEqual([
      "bot",
      "bot",
      "bot",
    ]);
    expect(
      await request({ stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 2 * 3_600_000)) }),
    ).toEqual({ ok: false, refusal: "stale" });
  });

  it("asks a bot for the same fields as a person: no code page for a bad address", async () => {
    expect(await request({ honeypot: "x", email: "not-an-email" })).toMatchObject({
      refusal: "invalid_email",
    });
    expect(await request({ honeypot: "x", email: "ana@other.com" })).toMatchObject({
      refusal: "domain_not_allowed",
    });
  });

  it("records bots and failed challenges up to a cap, and nothing past the per-IP limit", async () => {
    const requested = async () =>
      Number(
        (
          await t.db
            .selectFrom("audit_log")
            .select((eb) => eb.fn.countAll<number | string>().as("n"))
            .where("action", "=", "auth.sign_up_requested")
            .executeTakeFirstOrThrow()
        ).n,
      );
    for (let i = 0; i < 105; i++) await request({ honeypot: "x", email: `bot${i}@acme.com` });
    expect(await requested()).toBe(100);
    clock = new Date(clock.getTime() + 3_600_000);
    await policy({ challenge: true });
    expect(await request()).toEqual({ ok: false, refusal: "challenge" });
    expect((await audits("auth.sign_up_requested")).at(0)?.metadata).toMatchObject({
      outcome: "challenge",
    });
    await policy({ challenge: false });
    const before = await requested();
    const fromIp = (fields: Partial<signUp.SignUpRequest>) =>
      signUp.requestSignUp(deps(), { ...form(fields), ip: "203.0.113.7" });
    const results: string[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await fromIp({ honeypot: "x", email: `ip${i}@acme.com` });
      results.push(r.ok ? "ok" : r.refusal);
    }
    expect(results.slice(0, 10).every((r) => r === "ok")).toBe(true);
    expect(results.slice(10)).toEqual(["limited", "limited"]);
    expect(await requested()).toBe(before + 10);
  });

  it("records a flood of refused sign-ups up to the cap, whatever stops them (no client IP)", async () => {
    // 150 forged posts for one address: 10 reach the code page, then the per-address limit.
    for (let i = 0; i < 150; i++) await request({ stamp: "x" });
    const rows = await t.db
      .selectFrom("audit_log")
      .select((eb) => eb.fn.countAll<number | string>().as("n"))
      .where("action", "=", "auth.sign_up_requested")
      .executeTakeFirstOrThrow();
    expect(Number(rows.n)).toBe(100);
  });

  it("refuses a name with control, line-break or bidi characters", async () => {
    for (const name of ["A\u0000B", "Ana\nLima", "\u202egnp.exe", "Ana\u2028Lima"])
      expect(await request({ name }), JSON.stringify(name)).toMatchObject({ refusal: "name" });
    expect(await mails()).toEqual([]);
  });

  it("asks for a solved challenge when it's on, once each", async () => {
    await policy({ challenge: true });
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
    later(60_000);
    expect(
      await request({
        challenge: answer,
        stamp: formStamp(TEST_SECRET, new Date(clock.getTime() - 5000)),
      }),
    ).toEqual({
      ok: false,
      refusal: "challenge",
    });
  });

  it("checks the name, the password and the terms", async () => {
    expect(await request({ name: "  " })).toMatchObject({ refusal: "name", field: "name" });
    expect(await request({ password: "short" })).toMatchObject({ refusal: "password_short" });
    expect(await request({ password: "x".repeat(129) })).toMatchObject({
      refusal: "password_long",
    });
    await policy({ termsUrl: "https://acme.com/terms", termsVersion: "2026-11" });
    expect(await request({ termsVersion: "2026-11" })).toMatchObject({
      refusal: "terms",
      field: "terms",
    });
    const asked = await started({ termsAccepted: true, termsVersion: "2026-11" });
    await signUp.enterSignUpCode(deps(), {
      id: asked.id,
      code: codeIn((await mails())[0]?.text),
      ip: null,
    });
    const accepted = await t.db.selectFrom("terms_acceptances").select(["version"]).execute();
    expect(accepted).toEqual([{ version: "2026-11" }]);
  });

  it("refuses terms the form didn't show, and gives back the ones to read now", async () => {
    await policy({ termsUrl: "https://acme.com/terms", termsVersion: "2026-11" });
    // The form drawn on 2026-11; root saves 2026-12 (and asks everyone) before it's sent.
    await policy({
      termsUrl: "https://acme.com/terms-v2",
      termsVersion: "2026-12",
      askAgain: true,
    });
    const stale = { termsAccepted: true, termsVersion: "2026-11" };
    expect(await request(stale)).toEqual({
      ok: false,
      refusal: "terms_changed",
      field: "terms",
      terms: { url: "https://acme.com/terms-v2", version: "2026-12" },
    });
    // A form drawn before root set any terms posts none.
    // As the real form drawn before root set terms posts: no box, so nothing ticked.
    expect(await request({ termsAccepted: false, termsVersion: "" })).toMatchObject({
      refusal: "terms_changed",
      terms: { url: "https://acme.com/terms-v2", version: "2026-12" },
    });
    // A stale form left unticked hears of the change first, too.
    expect(await request({ termsAccepted: false, termsVersion: "2026-11" })).toMatchObject({
      refusal: "terms_changed",
    });
    expect(await mails()).toEqual([]);
    const asked = await started({ termsAccepted: true, termsVersion: "2026-12" });
    await signUp.enterSignUpCode(deps(), {
      id: asked.id,
      code: codeIn((await mails())[0]?.text),
      ip: null,
    });
    const accepted = await t.db.selectFrom("terms_acceptances").select(["version"]).execute();
    expect(accepted).toEqual([{ version: "2026-12" }]);
  });

  it("waits for approval when root asks, decided when the account is made", async () => {
    const asked = await started();
    await policy({ approval: true });
    expect(
      await signUp.enterSignUpCode(deps(), {
        id: asked.id,
        code: codeIn((await mails())[0]?.text),
        ip: null,
      }),
    ).toEqual({ ok: true, email: "ana@acme.com", waiting: true });
    const user = await t.db
      .selectFrom("user")
      .select("approval_pending_at")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    expect(user.approval_pending_at).not.toBeNull();
  });

  it("five wrong codes end the code; a new one after a minute works and ends the old", async () => {
    const asked = await started();
    const first = codeIn((await mails())[0]?.text);
    const wrong = first === "000000" ? "111111" : "000000";
    expect(await signUp.resendSignUpCode(deps(), { id: asked.id, ip: null })).toMatchObject({
      ok: false,
      refusal: "wait",
    });
    for (let i = 0; i < 5; i++)
      expect(await signUp.enterSignUpCode(deps(), { id: asked.id, code: wrong, ip: null })).toEqual(
        {
          ok: false,
          refusal: "wrong",
        },
      );
    expect(await signUp.enterSignUpCode(deps(), { id: asked.id, code: first, ip: null })).toEqual({
      ok: false,
      refusal: "spent",
    });
    later(61_000);
    expect(await signUp.resendSignUpCode(deps(), { id: asked.id, ip: null })).toEqual({ ok: true });
    const second = codeIn((await mails())[1]?.text);
    expect(
      await signUp.enterSignUpCode(deps(), { id: asked.id, code: second, ip: null }),
    ).toMatchObject({ ok: true });
    expect((await audits("auth.sign_up_code_failed")).length).toBe(6);
  });

  it("ends when its code's lifetime does; a new sign-up in the browser ends the one before", async () => {
    const asked = await started();
    later(15 * 60_000);
    expect(await signUp.codePage(deps(), asked.id)).toBeNull();
    expect(
      await signUp.enterSignUpCode(deps(), { id: asked.id, code: "000000", ip: null }),
    ).toEqual({
      ok: false,
      refusal: "ended",
    });
    const again = await started({ previous: asked.id });
    expect(await t.db.selectFrom("pending_sign_ups").select("id").execute()).toEqual([
      { id: again.id },
    ]);
    await signUp.cancelSignUp(deps(), again.id);
    expect(await t.db.selectFrom("pending_sign_ups").select("id").execute()).toEqual([]);
  });

  it("counts the limits: 10 sign-ups an hour per address, 3 codes an hour to it", async () => {
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await request();
      results.push(r.ok ? "ok" : r.refusal);
      later(61_000);
    }
    expect(results).toEqual(["ok", "ok", "ok", "limited"]);
    expect((await mails()).length).toBe(3);
  });

  it("writes a bot's email and does queuing's reads, then drops it: the same work, unsent", async () => {
    const rehearsed: { template: string; to: string; text: string }[] = [];
    const watch = (repo: SignUpRepository): SignUpRepository => ({
      ...repo,
      transaction: (work) => repo.transaction((trx) => work(watch(trx))),
      rehearseMail: async (mail, now) => {
        rehearsed.push({ template: mail.template, to: mail.to, text: mail.text });
        await repo.rehearseMail(mail, now);
      },
    });
    const watched = { ...deps(), repo: watch(deps().repo) };
    const asked = await signUp.requestSignUp(watched, { ip: null, ...form({ honeypot: "x" }) });
    expect(asked).toMatchObject({ ok: true });
    expect(rehearsed).toHaveLength(1);
    expect(rehearsed[0]).toMatchObject({ template: "sign_up_code", to: "ana@acme.com" });
    expect(codeIn(rehearsed[0]?.text)).toMatch(/^\d{6}$/);
    expect(await mails()).toEqual([]);
    // A person's is queued, never rehearsed.
    await signUp.requestSignUp(watched, { ip: null, ...form({ email: "bo@acme.com" }) });
    expect(rehearsed).toHaveLength(1);
    expect((await mails()).map((m) => m.to)).toEqual(["bo@acme.com"]);
  });

  it("takes as long for an existing address as for a new one", async () => {
    await kyselyIdentityRepository(t.db, t.dialect).createUserWithPassword(
      { email: "old@acme.com", name: "Old", role: "user", createdVia: "root", passwordHash: "x" },
      clock,
    );
    const time = async (email: string, fields: Partial<signUp.SignUpRequest> = {}) => {
      const start = performance.now();
      const r = await request({ email, ...fields });
      expect(r).toMatchObject({ ok: true });
      // An hour on, so the existing address's limit of 3 codes an hour never refuses a round.
      later(3_601_000);
      return performance.now() - start;
    };
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
    const fresh: number[] = [];
    const existing: number[] = [];
    const bots: number[] = [];
    // Alternated, so a slow moment of the machine falls on all three.
    // Nine rounds, for a median a busy CI machine can't sway (three swayed it on MySQL).
    for (let i = 0; i < 9; i++) {
      fresh.push(await time(`new${i}@acme.com`));
      existing.push(await time(`old@acme.com`));
      bots.push(await time(`bot${i}@acme.com`, { honeypot: "x" }));
    }
    const [a, b, c] = [median(fresh), median(existing), median(bots)];
    // Each is the password's hash (argon2id, tens of milliseconds) and one email, the bot's
    // written and dropped.
    const apart = (x: number, y: number) => Math.abs(x - y) / Math.max(x, y);
    expect(apart(a, b)).toBeLessThan(0.35);
    expect(apart(a, c)).toBeLessThan(0.35);
  });
});
