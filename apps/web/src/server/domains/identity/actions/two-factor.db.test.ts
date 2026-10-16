import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { setLoggerForTests } from "../../../log";
import { listAuditEvents } from "../../audit/actions/audit";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { betterAuthTwoFactorStore } from "../repositories/better-auth-two-factor-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/two-factor";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import { signIn, signOut } from "./session";
import {
  confirmTwoFactor,
  regenerateBackupCodes,
  startTwoFactor,
  turnOffTwoFactor,
  twoFactorStatus,
} from "./two-factor";

// Feature 105, task 3: enrolling, backup codes and turning off, on your own account.
let t: TestDb;
let app: AppAuth;
let userId: string;
let out: string[];
const email = "someone@example.com";
const password = "correct horse battery";

beforeEach(async () => {
  vi.stubEnv("LOG_LEVEL", "debug");
  vi.stubEnv("LOG_FORMAT", "json");
  out = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out.push(String(chunk));
    return true;
  });
  setLoggerForTests();
  t = await createTestDb();
  // A roomy limit: these tests sign in and check passwords often. The limit's own tests set theirs.
  app = testAppAuth(t, { trustProxy: true, limiter: new LoginRateLimiter({ max: 1000 }) });
  userId = await createTestUser(app, { email, password });
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  setLoggerForTests();
  await t.cleanup();
});

const withIp = (headers: Headers) => {
  headers.set("x-forwarded-for", "203.0.113.9");
  return headers;
};
const signedIn = async (who = email) => {
  const result = await signIn(
    withIp(new Headers()),
    { email: who, password, rememberMe: false },
    app,
  );
  if (!result.ok) throw new Error(result.error);
  return withIp(cookieHeaders(result.headers.get("set-cookie")));
};
const events = async () => (await listAuditEvents(t.db, t.dialect, {})).events;
const twoFactorEvents = async () =>
  (await events()).filter((e) => /two_factor|backup_codes/.test(e.action));

/** Starts and confirms an enrolment; returns the session after it (Better Auth replaces it). */
const enrol = async (session: Headers) => {
  const started = await startTwoFactor(session, { password }, app);
  if (!started.ok) throw new Error(started.error);
  const confirmed = await confirmTwoFactor(
    session,
    { code: totpCode(started.uri), uri: started.uri },
    app,
  );
  if (!confirmed.ok) throw new Error(confirmed.error);
  return { started, session: withIp(cookieHeaders(confirmed.headers.get("set-cookie"))) };
};

describe("startTwoFactor", () => {
  it("checks the password and hands out a QR code of the URI and ten backup codes, nothing active yet", async () => {
    const session = await signedIn();
    const started = await startTwoFactor(session, { password }, app);
    if (!started.ok) throw new Error(started.error);
    expect(started.uri).toMatch(
      /^otpauth:\/\/totp\/Ronne%20AI%20Marketplace:someone%40example\.com\?/,
    );
    expect(started.qrSvg).toMatch(/^<svg /);
    expect(started.backupCodes).toHaveLength(10);
    expect(await twoFactorStatus(session, app)).toEqual({
      enabled: false,
      backupCodesLeft: 0,
      hasPassword: true,
    });
    expect(await twoFactorEvents()).toEqual([]);
  });

  it("refuses a wrong password, and changes nothing", async () => {
    const session = await signedIn();
    expect(await startTwoFactor(session, { password: "wrong horse battery" }, app)).toEqual({
      ok: false,
      error: "wrong_password",
    });
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toEqual([]);
  });

  it("counts every password check against the sign-in limit: once reached, the right one is refused too", async () => {
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 2 }) });
    const session = await signedIn();
    const attempt = (p: string) => startTwoFactor(session, { password: p }, limited);
    expect(await attempt("wrong horse battery")).toMatchObject({ error: "wrong_password" });
    expect(await attempt("wrong horse battery")).toMatchObject({ error: "wrong_password" });
    expect(await attempt(password)).toMatchObject({ ok: false, error: "rate_limited" });
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toEqual([]);
  });

  it("starting again before confirming shows the same setup, so every page shown works", async () => {
    const session = await signedIn();
    const first = await startTwoFactor(session, { password }, app);
    const second = await startTwoFactor(session, { password }, app);
    if (!first.ok || !second.ok) throw new Error("not started");
    expect(second).toEqual(first);
    expect(
      (await confirmTwoFactor(session, { code: totpCode(first.uri), uri: first.uri }, app)).ok,
    ).toBe(true);
  });

  it("start over makes a new setup; a page showing the old one is told it was replaced", async () => {
    const session = await signedIn();
    const first = await startTwoFactor(session, { password }, app);
    const fresh = await startTwoFactor(session, { password, startOver: true }, app);
    if (!first.ok || !fresh.ok) throw new Error("not started");
    expect(fresh.uri).not.toBe(first.uri);
    expect(fresh.backupCodes).not.toEqual(first.backupCodes);
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toHaveLength(1);
    expect(
      await confirmTwoFactor(session, { code: totpCode(first.uri), uri: first.uri }, app),
    ).toEqual({ ok: false, error: "replaced" });
    expect(
      (await confirmTwoFactor(session, { code: totpCode(fresh.uri), uri: fresh.uri }, app)).ok,
    ).toBe(true);
  });

  it("several at once show the same setup, which any of the pages confirms", async () => {
    const session = await signedIn();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => startTwoFactor(session, { password }, app)),
    );
    const uris = new Set(results.map((r) => (r.ok ? r.uri : r.error)));
    expect([...uris]).toHaveLength(1);
    expect([...uris][0]).toMatch(/^otpauth:/);
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toHaveLength(1);
    const last = results.at(-1);
    if (!last?.ok) throw new Error("not started");
    expect(
      (await confirmTwoFactor(session, { code: totpCode(last.uri), uri: last.uri }, app)).ok,
    ).toBe(true);
  });

  it("several start-overs at once run one after another: one page confirms, none is told 'wrong code'", async () => {
    const session = await signedIn();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => startTwoFactor(session, { password, startOver: true }, app)),
    );
    // One at a time, each replacing the last whole: none loses on the unique index.
    expect(results.map((r) => r.ok)).toEqual([true, true, true, true, true, true]);
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toHaveLength(1);
    const answers: string[] = [];
    for (const r of results)
      if (r.ok) {
        const answer = await confirmTwoFactor(session, { code: totpCode(r.uri), uri: r.uri }, app);
        answers.push(answer.ok ? "on" : answer.error);
      }
    expect(answers.filter((a) => a === "on")).toHaveLength(1);
    // Before the one that turned it on: replaced; after it, this session was replaced too.
    for (const a of answers) expect(["on", "replaced", "not_signed_in"]).toContain(a);
  });

  it("a start whose enrolment another server replaced before it answered shows nothing", async () => {
    const store = betterAuthTwoFactorStore(app.auth, app.db);
    const deps: service.TwoFactorDeps = {
      sessions: betterAuthSessionStore(app.auth),
      repo: kyselyIdentityRepository(app.db, app.dialect),
      limiter: new LoginRateLimiter({ max: 1000 }),
      twoFactor: {
        ...store,
        // Another server's start lands between this one's and its read-back.
        begin: async (headers, p) => {
          const mine = await store.begin(headers, p);
          await store.begin(headers, p);
          return mine;
        },
      },
    };
    const session = await signedIn();
    expect(
      await service.startTwoFactor(deps, { headers: session, ip: null }, { password }),
    ).toEqual({
      ok: false,
      error: "another_tab",
    });
  });

  it("refuses to confirm with a URI that isn't the enrolment's", async () => {
    const session = await signedIn();
    const started = await startTwoFactor(session, { password }, app);
    if (!started.ok) throw new Error(started.error);
    for (const uri of [
      "",
      "not a uri",
      "otpauth://totp/x?secret=AAAAAAAA",
      started.uri.replace(/secret=[^&]+/, ""),
    ])
      expect(await confirmTwoFactor(session, { code: totpCode(started.uri), uri }, app)).toEqual({
        ok: false,
        error: "replaced",
      });
  });

  it("refuses someone signed out, and someone already enrolled", async () => {
    expect(await startTwoFactor(new Headers(), { password }, app)).toEqual({
      ok: false,
      error: "not_signed_in",
    });
    const { session } = await enrol(await signedIn());
    expect(await startTwoFactor(session, { password }, app)).toEqual({
      ok: false,
      error: "already_on",
    });
  });

  it("refuses an account with no password (single sign-on only)", async () => {
    const session = await signedIn();
    await t.db
      .updateTable("account")
      .set({ password: null })
      .where("user_id", "=", userId)
      .execute();
    expect(await startTwoFactor(session, { password }, app)).toEqual({
      ok: false,
      error: "no_password",
    });
    expect(await twoFactorStatus(session, app)).toMatchObject({ hasPassword: false });
  });
});

describe("confirmTwoFactor", () => {
  it("turns two-factor on with the first right code, audited, and replaces the session", async () => {
    const before = await signedIn();
    const { session } = await enrol(before);
    expect(await twoFactorStatus(session, app)).toEqual({
      enabled: true,
      backupCodesLeft: 10,
      hasPassword: true,
    });
    // The session the enrolment started in is gone; the new one works.
    expect(await twoFactorStatus(before, app)).toBeNull();
    expect(await twoFactorEvents()).toMatchObject([
      {
        actorId: userId,
        action: "auth.two_factor_enabled",
        targetType: "user",
        targetId: userId,
        metadata: { method: "totp" },
        ipAddress: "203.0.113.9",
      },
    ]);
  });

  it("refuses a wrong code or junk, and a confirm with nothing started (as replaced)", async () => {
    const session = await signedIn();
    expect(
      await confirmTwoFactor(session, { code: "123456", uri: "otpauth://totp/x?secret=AA" }, app),
    ).toEqual({ ok: false, error: "replaced" });
    const started = await startTwoFactor(session, { password }, app);
    if (!started.ok) throw new Error(started.error);
    for (const code of ["000000", "12345", "abcdef", ""])
      expect(await confirmTwoFactor(session, { code, uri: started.uri }, app)).toEqual({
        ok: false,
        error: "wrong_code",
      });
    expect(await twoFactorStatus(session, app)).toMatchObject({ enabled: false });
    expect(await twoFactorEvents()).toEqual([]);
  });

  it("a double click turns it on once, and is recorded once", async () => {
    const session = await signedIn();
    const started = await startTwoFactor(session, { password }, app);
    if (!started.ok) throw new Error(started.error);
    const input = { code: totpCode(started.uri), uri: started.uri };
    const results = await Promise.all([
      confirmTwoFactor(session, input, app),
      confirmTwoFactor(session, input, app),
      confirmTwoFactor(session, input, app),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results) if (!r.ok) expect(["already_on", "not_signed_in"]).toContain(r.error);
    expect(await twoFactorEvents()).toHaveLength(1);
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", userId).execute(),
    ).toHaveLength(1);
  });

  it("a start racing a confirm in the same browser answers, never throws", async () => {
    for (let round = 0; round < 5; round++) {
      const who = `round${round}@example.com`;
      await createTestUser(app, { email: who, password });
      const session = await signedIn(who);
      const started = await startTwoFactor(session, { password }, app);
      if (!started.ok) throw new Error(started.error);
      const [confirmed, again] = await Promise.all([
        confirmTwoFactor(session, { code: totpCode(started.uri), uri: started.uri }, app),
        startTwoFactor(session, { password }, app),
      ]);
      // The start either showed the same setup first, or found the session replaced after it.
      expect(confirmed.ok).toBe(true);
      if (!again.ok) expect(again.error).toBe("not_signed_in");
      else expect(again.uri).toBe(started.uri);
    }
  });

  it("a start in another browser racing a confirm never leaves a page saying 'on' over another secret", async () => {
    for (let round = 0; round < 5; round++) {
      const who = `round${round}@example.com`;
      await createTestUser(app, { email: who, password });
      const [a, b] = [await signedIn(who), await signedIn(who)];
      const started = await startTwoFactor(a, { password }, app);
      if (!started.ok) throw new Error(started.error);
      const [confirmed, other] = await Promise.all([
        confirmTwoFactor(a, { code: totpCode(started.uri), uri: started.uri }, app),
        startTwoFactor(b, { password }, app),
      ]);
      if (confirmed.ok) expect(other).toMatchObject({ ok: false, error: "already_on" });
      else {
        // The other browser started first: its own new setup, and page A was told so.
        expect(confirmed.error).toBe("replaced");
        if (!other.ok) throw new Error(other.error);
        expect(other.uri).not.toBe(started.uri);
      }
    }
  });

  it("another browser never sees the pending setup: it gets its own, and the first page is told it was replaced", async () => {
    const [mine, theirs] = [await signedIn(), await signedIn()];
    const first = await startTwoFactor(mine, { password }, app);
    const other = await startTwoFactor(theirs, { password }, app);
    if (!first.ok || !other.ok) throw new Error("not started");
    expect(other.uri).not.toBe(first.uri);
    for (const code of first.backupCodes) expect(other.backupCodes).not.toContain(code);
    expect(
      await confirmTwoFactor(mine, { code: totpCode(first.uri), uri: first.uri }, app),
    ).toEqual({ ok: false, error: "replaced" });
    // The browser that started the newest one sees it again.
    const again = await startTwoFactor(theirs, { password }, app);
    expect(again).toEqual(other);
    // And the first browser, starting again, gets a new one too (it isn't the starter now).
    const back = await startTwoFactor(mine, { password }, app);
    if (!back.ok) throw new Error(back.error);
    expect(back.uri).not.toBe(other.uri);
  });

  it("a setup started more than a day ago isn't shown again: a start makes a new one", async () => {
    const session = await signedIn();
    const first = await startTwoFactor(session, { password }, app);
    if (!first.ok) throw new Error(first.error);
    await t.db
      .updateTable("verification")
      .set({ expires_at: toDbDate(new Date(Date.now() - 1000), t.dialect) })
      .where("identifier", "=", `two-factor-setup:${userId}`)
      .execute();
    const again = await startTwoFactor(session, { password }, app);
    if (!again.ok) throw new Error(again.error);
    expect(again.uri).not.toBe(first.uri);
  });

  it("a start over in another browser racing a confirm never leaves a page saying 'on' over another secret", async () => {
    for (let round = 0; round < 5; round++) {
      const who = `over${round}@example.com`;
      await createTestUser(app, { email: who, password });
      const [a, b] = [await signedIn(who), await signedIn(who)];
      const started = await startTwoFactor(a, { password }, app);
      if (!started.ok) throw new Error(started.error);
      const [confirmed, other] = await Promise.all([
        confirmTwoFactor(a, { code: totpCode(started.uri), uri: started.uri }, app),
        startTwoFactor(b, { password, startOver: true }, app),
      ]);
      if (confirmed.ok) {
        expect(other).toMatchObject({ ok: false, error: "already_on" });
        const after = withIp(cookieHeaders(confirmed.headers.get("set-cookie")));
        // What's stored is what page A showed: its backup codes work.
        expect(
          (await turnOffTwoFactor(after, { password, code: started.backupCodes[0] ?? "" }, app)).ok,
        ).toBe(true);
      } else {
        expect(confirmed.error).toBe("replaced");
        expect(other.ok).toBe(true);
      }
    }
  });

  it("counts wrong codes against the limit: once reached, the right code is refused too", async () => {
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 2 }) });
    const session = await signedIn();
    const started = await startTwoFactor(session, { password }, limited);
    if (!started.ok) throw new Error(started.error);
    const attempt = (code: string) =>
      confirmTwoFactor(session, { code, uri: started.uri }, limited);
    expect(await attempt("000000")).toMatchObject({ error: "wrong_code" });
    expect(await attempt("000001")).toMatchObject({ error: "wrong_code" });
    expect(await attempt(totpCode(started.uri))).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
    expect(await twoFactorStatus(session, app)).toMatchObject({ enabled: false });
  });

  it("an ordinary setup (a reload, a typo) doesn't use up the limit", async () => {
    // The real limit: 5 a minute per email, shared with signing in.
    const real = testAppAuth(t, { limiter: new LoginRateLimiter() });
    const signIn5 = async () => {
      const result = await signIn(
        withIp(new Headers()),
        { email, password, rememberMe: false },
        real,
      );
      if (!result.ok) throw new Error(result.error);
      return withIp(cookieHeaders(result.headers.get("set-cookie")));
    };
    const session = await signIn5();
    const started = await startTwoFactor(session, { password }, real);
    const again = await startTwoFactor(session, { password }, real);
    if (!started.ok || !again.ok) throw new Error("not started");
    expect(await confirmTwoFactor(session, { code: "000000", uri: again.uri }, real)).toMatchObject(
      {
        error: "wrong_code",
      },
    );
    const on = await confirmTwoFactor(session, { code: totpCode(again.uri), uri: again.uri }, real);
    if (!on.ok) throw new Error(on.error);
    const after = withIp(cookieHeaders(on.headers.get("set-cookie")));
    const codes = await regenerateBackupCodes(after, { password }, real);
    if (!codes.ok) throw new Error(codes.error);
    expect(
      (await turnOffTwoFactor(after, { password, code: codes.backupCodes[0] ?? "" }, real)).ok,
    ).toBe(true);
    await signIn5();
  });

  it("a sign-out racing a start answers, never throws", async () => {
    for (let round = 0; round < 5; round++) {
      const session = await signedIn();
      const [, started] = await Promise.all([
        signOut(session, app),
        startTwoFactor(session, { password }, app),
      ]);
      expect(started.ok || started.error === "not_signed_in").toBe(true);
    }
  });

  it("accepts a code typed with spaces", async () => {
    const session = await signedIn();
    const started = await startTwoFactor(session, { password }, app);
    if (!started.ok) throw new Error(started.error);
    const code = totpCode(started.uri);
    expect(
      (
        await confirmTwoFactor(
          session,
          { code: `${code.slice(0, 3)} ${code.slice(3)}`, uri: started.uri },
          app,
        )
      ).ok,
    ).toBe(true);
  });
});

describe("regenerateBackupCodes", () => {
  it("makes ten new codes with the password, voids the old, and is audited", async () => {
    const { session, started } = await enrol(await signedIn());
    const result = await regenerateBackupCodes(session, { password }, app);
    if (!result.ok) throw new Error(result.error);
    expect(result.backupCodes).toHaveLength(10);
    expect(result.backupCodes).not.toEqual(started.backupCodes);
    // An old code no longer turns it off; a new one does.
    expect(
      await turnOffTwoFactor(session, { password, code: started.backupCodes[0] ?? "" }, app),
    ).toEqual({ ok: false, error: "wrong_code" });
    expect(
      (await turnOffTwoFactor(session, { password, code: result.backupCodes[0] ?? "" }, app)).ok,
    ).toBe(true);
    expect((await twoFactorEvents()).map((e) => [e.action, e.metadata])).toContainEqual([
      "auth.backup_codes_regenerated",
      { count: 10 },
    ]);
  });

  it("a double click makes one set; another within 30 seconds is refused", async () => {
    const { session } = await enrol(await signedIn());
    const results = await Promise.all([
      regenerateBackupCodes(session, { password }, app),
      regenerateBackupCodes(session, { password }, app),
    ]);
    const made = results.flatMap((r) => (r.ok ? [r.backupCodes] : []));
    expect(made).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: "just_made" });
    // The set shown is the one that works.
    expect((await turnOffTwoFactor(session, { password, code: made[0]?.[0] ?? "" }, app)).ok).toBe(
      true,
    );
    expect(
      (await twoFactorEvents()).filter((e) => e.action === "auth.backup_codes_regenerated"),
    ).toHaveLength(1);
  });

  it("refuses a wrong password, and someone not enrolled", async () => {
    const plain = await signedIn();
    expect(await regenerateBackupCodes(plain, { password }, app)).toEqual({
      ok: false,
      error: "not_enabled",
    });
    const { session } = await enrol(plain);
    expect(await regenerateBackupCodes(session, { password: "wrong horse battery" }, app)).toEqual({
      ok: false,
      error: "wrong_password",
    });
  });
});

describe("regenerateBackupCodes' limit", () => {
  it("counts wrong passwords: once reached, the right one is refused too", async () => {
    const { session } = await enrol(await signedIn());
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 2 }) });
    const attempt = (p: string) => regenerateBackupCodes(session, { password: p }, limited);
    expect(await attempt("wrong horse battery")).toMatchObject({ error: "wrong_password" });
    expect(await attempt("wrong horse battery")).toMatchObject({ error: "wrong_password" });
    expect(await attempt(password)).toMatchObject({ ok: false, error: "rate_limited" });
  });
});

describe("turnOffTwoFactor", () => {
  it("needs the password and a code from the app, deletes the record, and is audited", async () => {
    const { session, started } = await enrol(await signedIn());
    const result = await turnOffTwoFactor(session, { password, code: totpCode(started.uri) }, app);
    if (!result.ok) throw new Error(result.error);
    expect(await t.db.selectFrom("two_factor").select("id").execute()).toEqual([]);
    const after = withIp(cookieHeaders(result.headers.get("set-cookie")));
    expect(await twoFactorStatus(after, app)).toMatchObject({ enabled: false });
    expect((await twoFactorEvents()).map((e) => e.action)).toEqual([
      "auth.two_factor_disabled",
      "auth.two_factor_enabled",
    ]);
  });

  it("takes a backup code instead, for a lost phone", async () => {
    const { session, started } = await enrol(await signedIn());
    const result = await turnOffTwoFactor(
      session,
      { password, code: started.backupCodes[3] ?? "" },
      app,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a wrong password before using up a backup code, and a wrong code", async () => {
    const { session, started } = await enrol(await signedIn());
    const code = started.backupCodes[0] ?? "";
    expect(await turnOffTwoFactor(session, { password: "wrong horse battery", code }, app)).toEqual(
      {
        ok: false,
        error: "wrong_password",
      },
    );
    expect(await turnOffTwoFactor(session, { password, code: "000000" }, app)).toEqual({
      ok: false,
      error: "wrong_code",
    });
    expect(await twoFactorStatus(session, app)).toEqual({
      enabled: true,
      backupCodesLeft: 10,
      hasPassword: true,
    });
    // The backup code the wrong password was sent with still works.
    expect((await turnOffTwoFactor(session, { password, code }, app)).ok).toBe(true);
  });

  it("counts every code check against the sign-in limit: once reached, a right code is refused too", async () => {
    const { session, started } = await enrol(await signedIn());
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 2 }) });
    const attempt = (code: string) => turnOffTwoFactor(session, { password, code }, limited);
    expect(await attempt("000000")).toMatchObject({ error: "wrong_code" });
    expect(await attempt("000001")).toMatchObject({ error: "wrong_code" });
    expect(await attempt(totpCode(started.uri))).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
    expect(await attempt(started.backupCodes[0] ?? "")).toMatchObject({ error: "rate_limited" });
    expect(await twoFactorStatus(session, app)).toMatchObject({
      enabled: true,
      backupCodesLeft: 10,
    });
  });

  it("a double click turns it off once, and is recorded once", async () => {
    const { session, started } = await enrol(await signedIn());
    const results = await Promise.all([
      turnOffTwoFactor(session, { password, code: totpCode(started.uri) }, app),
      turnOffTwoFactor(session, { password, code: started.backupCodes[0] ?? "" }, app),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results) if (!r.ok) expect(["not_enabled", "not_signed_in"]).toContain(r.error);
    expect(
      (await twoFactorEvents()).filter((e) => e.action === "auth.two_factor_disabled"),
    ).toHaveLength(1);
  });
});

describe("secrets", () => {
  it("never writes the secret, a code or the password to the log or the audit log", async () => {
    const { session, started } = await enrol(await signedIn());
    const regenerated = await regenerateBackupCodes(session, { password }, app);
    if (!regenerated.ok) throw new Error(regenerated.error);
    await turnOffTwoFactor(session, { password, code: "000000" }, app);
    await turnOffTwoFactor(session, { password, code: regenerated.backupCodes[0] ?? "" }, app);

    const secret = new URL(started.uri).searchParams.get("secret") ?? "";
    const written = out.join("");
    const audit = JSON.stringify(await events());
    expect(written).toContain('"event":"auth.two_factor_enabled"');
    for (const [what, value] of [
      ["the secret", secret],
      ["the URI", started.uri],
      ["the password", password],
      ...started.backupCodes.map((c) => ["a backup code", c] as const),
      ...regenerated.backupCodes.map((c) => ["a new backup code", c] as const),
    ] as const) {
      expect(written, what).not.toContain(value);
      expect(audit, what).not.toContain(value);
    }
  });
});
