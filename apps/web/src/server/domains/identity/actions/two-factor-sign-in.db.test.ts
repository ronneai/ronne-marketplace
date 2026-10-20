import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { SESSION_EXPIRES_IN } from "../repositories/better-auth";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { betterAuthTwoFactorStore } from "../repositories/better-auth-two-factor-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/two-factor";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import { signIn } from "./session";
import {
  completeTwoFactorSignIn,
  confirmTwoFactor,
  startTwoFactor,
  turnOffTwoFactor,
} from "./two-factor";

// Feature 105, task 5: the second step at sign-in.
let t: TestDb;
let app: AppAuth;
let userId: string;
const email = "someone@example.com";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { trustProxy: true, limiter: new LoginRateLimiter({ max: 1000 }) });
  userId = await createTestUser(app, { email, password });
});
afterEach(async () => {
  vi.useRealTimers();
  await t.cleanup();
});

/**
 * Freezes the clock (only `Date`: the database drivers' timers stay real, as
 * docs/knowledge/fake-timers.md asks) in the middle of a 30-second period, for tests that need
 * three codes from one window: without it, the oldest one can expire between being chosen and
 * being checked when a boundary passes (seen by forcing one at every clock read).
 */
const freezeMidPeriod = () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Math.floor(Date.now() / 30_000) * 30_000 + 15_000);
};

const ip = (headers: Headers) => {
  headers.set("x-forwarded-for", "203.0.113.9");
  return headers;
};

/** Turns two-factor on for the user; returns the URI and the backup codes. */
const enrolled = async () => {
  const first = await signIn(ip(new Headers()), { email, password, rememberMe: false }, app);
  if (!first.ok || first.twoFactor) throw new Error("not signed in");
  const session = ip(cookieHeaders(first.headers.get("set-cookie")));
  const started = await startTwoFactor(session, { password }, app);
  if (!started.ok) throw new Error(started.error);
  const enrolCode = totpCode(started.uri);
  const on = await confirmTwoFactor(session, { code: enrolCode, uri: started.uri }, app);
  if (!on.ok) throw new Error(on.error);
  return { uri: started.uri, backupCodes: started.backupCodes, enrolCode };
};

/**
 * A code the app accepts now (this period or one either side) that isn't one of `used`: three
 * periods, at most two used, so there's always one. Computing "the previous period" later could
 * otherwise land on the enrolment's own code when a 30-second boundary passes.
 */
const fresh = (uri: string, used: string[]) => {
  const code = [1, 0, -1].map((step) => totpCode(uri, { step })).find((c) => !used.includes(c));
  if (!code) throw new Error("no unused code in the window");
  return code;
};

/** The first step with the right password: the challenge's cookie, for the second. */
const challenge = async (rememberMe = false) => {
  const result = await signIn(ip(new Headers()), { email, password, rememberMe }, app);
  if (!result.ok) throw new Error(result.error);
  expect(result.twoFactor).toBe(true);
  return ip(cookieHeaders(result.headers.get("set-cookie")));
};

const sessions = async () =>
  (await t.db.selectFrom("session").select("id").where("user_id", "=", userId).execute()).length;
const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const complete = (
  pending: Headers,
  code: string,
  method: "totp" | "backup_code" = "totp",
  on: AppAuth = app,
) => completeTwoFactorSignIn(pending, { code, method }, on);

describe("the first step", () => {
  it("with two-factor on, a right password gives a challenge: no session, nothing audited as signed in", async () => {
    await enrolled();
    const before = await sessions();
    const signedIn = (await events("auth.signed_in")).length;
    const pending = await challenge();
    expect(pending.get("cookie")).toMatch(/ronne\.two_factor=/);
    expect(await sessions()).toBe(before);
    expect(await events("auth.signed_in")).toHaveLength(signedIn);
  });

  it("without two-factor, signing in is as before", async () => {
    const result = await signIn(ip(new Headers()), { email, password, rememberMe: false }, app);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.twoFactor).toBeFalsy();
  });
});

describe("the second step", () => {
  it("a right code signs in, audited with the method and Remember me", async () => {
    const { uri } = await enrolled();
    const before = await sessions();
    // Enrolling signed in by password: start from no sign-in on record, so only the second step
    // can give the person a last sign-in (123).
    await t.db.deleteFrom("audit_log").where("action", "=", "auth.signed_in").execute();
    expect((await kyselyIdentityRepository(t.db, t.dialect).lastSignIns([userId])).size).toBe(0);
    const result = await complete(await challenge(), totpCode(uri, { step: 1 }));
    if (!result.ok) throw new Error(result.error);
    expect(result.headers.get("set-cookie")).toMatch(/ronne\.session_token=/);
    expect(await sessions()).toBe(before + 1);
    expect((await events("auth.signed_in")).at(0)).toMatchObject({
      actorId: userId,
      targetType: "session",
      metadata: { remember: false, twoFactor: "totp" },
      ipAddress: "203.0.113.9",
    });
    // The users list's Last sign-in (123) reads that event: the second step completes a sign-in.
    const last = await kyselyIdentityRepository(t.db, t.dialect).lastSignIns([userId]);
    expect(last.get(userId)).toBeInstanceOf(Date);
  });

  it("a wrong code is refused and audited, and the challenge still takes the right one", async () => {
    const { uri } = await enrolled();
    const pending = await challenge();
    expect(await complete(pending, "000000")).toEqual({ ok: false, error: "wrong_code" });
    expect(await complete(pending, "12345")).toEqual({ ok: false, error: "wrong_code" });
    expect((await events("auth.two_factor_failed")).at(-1)).toMatchObject({
      actorId: userId,
      metadata: { method: "totp", reason: "wrong_code" },
    });
    expect((await complete(pending, totpCode(uri, { step: 1 }))).ok).toBe(true);
  });

  it("refuses the code used to turn it on, without spending the challenge", async () => {
    const { uri, enrolCode } = await enrolled();
    const pending = await challenge();
    expect(await complete(pending, enrolCode)).toEqual({ ok: false, error: "used" });
    expect((await complete(pending, fresh(uri, [enrolCode]))).ok).toBe(true);
  });

  it("refuses a code a second sign-in already used", async () => {
    freezeMidPeriod();
    const { uri, enrolCode } = await enrolled();
    const code = totpCode(uri, { step: 1 });
    expect((await complete(await challenge(), code)).ok).toBe(true);
    const second = await challenge();
    expect(await complete(second, code)).toEqual({ ok: false, error: "used" });
    expect((await complete(second, fresh(uri, [enrolCode, code]))).ok).toBe(true);
  });

  it("two sign-ins with one code at once: one session, the other refused", async () => {
    const { uri } = await enrolled();
    const code = totpCode(uri, { step: 1 });
    const [a, b] = [await challenge(), await challenge()];
    const before = await sessions();
    const results = await Promise.all([complete(a, code), complete(b, code)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "used" });
    expect(await sessions()).toBe(before + 1);
  });

  it("a backup code signs in once", async () => {
    const { backupCodes } = await enrolled();
    const code = backupCodes[0] ?? "";
    const result = await complete(await challenge(), code, "backup_code");
    expect(result.ok).toBe(true);
    expect((await events("auth.signed_in")).at(0)).toMatchObject({
      metadata: { twoFactor: "backup_code" },
    });
    expect(await complete(await challenge(), code, "backup_code")).toEqual({
      ok: false,
      error: "wrong_code",
    });
  });

  it("refuses an account disabled after the password step, creating no session", async () => {
    const { uri } = await enrolled();
    const pending = await challenge();
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    const before = await sessions();
    expect(await complete(pending, totpCode(uri, { step: 1 }))).toEqual({
      ok: false,
      error: "refused",
    });
    expect(await sessions()).toBe(before);
  });

  it("a challenge that ran out, or none at all, is expired", async () => {
    const { uri } = await enrolled();
    const pending = await challenge();
    await t.db
      .updateTable("verification")
      .set({ expires_at: toDbDate(new Date(Date.now() - 1000), t.dialect) })
      .where("identifier", "like", "2fa-%")
      .execute();
    expect(await complete(pending, totpCode(uri, { step: 1 }))).toEqual({
      ok: false,
      error: "expired",
    });
    expect(await complete(ip(new Headers()), totpCode(uri, { step: 1 }))).toEqual({
      ok: false,
      error: "expired",
    });
  });

  it("five wrong codes void the challenge; ten in a row lock the second step", async () => {
    const { uri } = await enrolled();
    const first = await challenge();
    for (let i = 0; i < 5; i++)
      expect(await complete(first, "000000")).toEqual({ ok: false, error: "wrong_code" });
    expect(await complete(first, totpCode(uri, { step: 1 }))).toEqual({
      ok: false,
      error: "too_many",
    });
    const second = await challenge();
    for (let i = 0; i < 5; i++) await complete(second, "000000");
    const third = await challenge();
    expect(await complete(third, totpCode(uri, { step: 1 }))).toEqual({
      ok: false,
      error: "locked",
    });
    expect((await events("auth.two_factor_failed")).map((e) => e.metadata?.reason)).toContain(
      "locked",
    );
  });

  it("a secret that won't decrypt with this AUTH_SECRET says so, not a 500", async () => {
    const { uri } = await enrolled();
    const other = testAppAuth(t, { secret: "another-secret-another-secret-0000000" });
    const result = await signIn(ip(new Headers()), { email, password, rememberMe: false }, other);
    if (!result.ok) throw new Error(result.error);
    const pending = ip(cookieHeaders(result.headers.get("set-cookie")));
    expect(await complete(pending, totpCode(uri, { step: 1 }), "totp", other)).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("keeps Remember me from the first step", async () => {
    freezeMidPeriod();
    const { uri, enrolCode } = await enrolled();
    const first = totpCode(uri, { step: 1 });
    const remembered = await complete(await challenge(true), first);
    if (!remembered.ok) throw new Error(remembered.error);
    const cookie = (remembered.headers.get("set-cookie") ?? "")
      .split(/,(?=\s*[\w.-]+=)/)
      .find((c) => c.trim().startsWith("ronne.session_token="));
    expect(cookie).toContain(`Max-Age=${SESSION_EXPIRES_IN}`);
    const browserOnly = await complete(await challenge(false), fresh(uri, [enrolCode, first]));
    if (!browserOnly.ok) throw new Error(browserOnly.error);
    const session = (browserOnly.headers.get("set-cookie") ?? "")
      .split(/,(?=\s*[\w.-]+=)/)
      .find((c) => c.trim().startsWith("ronne.session_token="));
    expect(session).not.toMatch(/Max-Age/i);
    // The audit says what the session got: from Better Auth's signed cookie, never the form.
    // (newest first; only the two sign-ins with a second step)
    expect(
      (await events("auth.signed_in"))
        .filter((e) => e.metadata?.twoFactor)
        .map((e) => e.metadata?.remember),
    ).toEqual([false, true]);
  });
});

describe("the challenge's cookie", () => {
  /** The challenge's cookie value as the browser holds it (name=value). */
  const challengeCookie = (pending: Headers) =>
    (pending.get("cookie") ?? "").split("; ").find((c) => c.startsWith("ronne.two_factor=")) ?? "";

  it("a forged signature is no challenge: expired, no session, logged but not audited", async () => {
    const { uri } = await enrolled();
    const pending = await challenge();
    const forged = challengeCookie(pending).replace(
      /\.[^.]*$/,
      ".AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA%3D",
    );
    const before = await sessions();
    for (let i = 0; i < 20; i++)
      expect(
        await complete(ip(new Headers({ cookie: forged })), totpCode(uri, { step: 1 })),
      ).toEqual({ ok: false, error: "expired" });
    expect(await sessions()).toBe(before);
    // Anyone can send that: it mustn't fill the audit log.
    expect(await events("auth.two_factor_failed")).toEqual([]);
  });

  it("a real challenge that ran out is audited", async () => {
    const { uri } = await enrolled();
    const pending = await challenge();
    await t.db
      .updateTable("verification")
      .set({ expires_at: toDbDate(new Date(Date.now() - 1000), t.dialect) })
      .where("identifier", "like", "2fa-%")
      .execute();
    expect(await complete(pending, totpCode(uri, { step: 1 }))).toEqual({
      ok: false,
      error: "expired",
    });
    expect((await events("auth.two_factor_failed")).at(0)).toMatchObject({
      actorId: userId,
      metadata: { reason: "expired" },
    });
  });

  it("another account's challenge cookie beside the real one changes nothing: no session, never names them", async () => {
    const { uri } = await enrolled();
    const otherId = await createTestUser(app, { email: "other@example.com", password });
    const theirs = await signIn(
      ip(new Headers()),
      { email: "other@example.com", password, rememberMe: false },
      app,
    );
    if (!theirs.ok) throw new Error(theirs.error);
    // Two cookies of one name (or the __Secure- one beside it): read as no challenge at all.
    const pending = await challenge();
    const decoy =
      (theirs.headers.get("set-cookie") ?? "").match(/ronne\.session_token=[^;]+/)?.[0] ?? "";
    for (const cookie of [
      `__Secure-${challengeCookie(pending)}; ${challengeCookie(pending)}`,
      `${challengeCookie(pending)}; ${challengeCookie(pending)}`,
      `${decoy}; ${challengeCookie(pending)}`,
    ]) {
      const result = await complete(ip(new Headers({ cookie })), "000000");
      expect(result.ok).toBe(false);
    }
    for (const event of await events("auth.two_factor_failed"))
      expect(event.actorId).not.toBe(otherId);
    // The real challenge still works.
    expect((await complete(pending, totpCode(uri, { step: 1 }))).ok).toBe(true);
  });

  it("two challenge cookies of one name, however spaced, are no challenge: Better Auth and we can't read different ones", async () => {
    const { uri } = await enrolled();
    const otherId = await createTestUser(app, { email: "other@example.com", password });
    // The other account's own challenge: a real, signed one.
    const otherFirst = await signIn(
      ip(new Headers()),
      { email: "other@example.com", password, rememberMe: false },
      app,
    );
    if (!otherFirst.ok) throw new Error(otherFirst.error);
    const otherSession = ip(cookieHeaders(otherFirst.headers.get("set-cookie")));
    const otherStart = await startTwoFactor(otherSession, { password }, app);
    if (!otherStart.ok) throw new Error(otherStart.error);
    const otherOn = await confirmTwoFactor(
      otherSession,
      { code: totpCode(otherStart.uri), uri: otherStart.uri },
      app,
    );
    if (!otherOn.ok) throw new Error(otherOn.error);
    const theirs = await signIn(
      ip(new Headers()),
      { email: "other@example.com", password, rememberMe: false },
      app,
    );
    if (!theirs.ok) throw new Error(theirs.error);
    const theirCookie = challengeCookie(ip(cookieHeaders(theirs.headers.get("set-cookie"))));
    const mine = challengeCookie(await challenge());
    const value = (cookie: string) => cookie.slice(cookie.indexOf("=") + 1);
    const before = await sessions();
    for (const cookie of [
      `ronne.two_factor =${value(mine)}; ronne.two_factor=${value(theirCookie)}`,
      `ronne.two_factor=${value(theirCookie)}; ronne.two_factor =${value(mine)}`,
      ` ronne.two_factor=${value(mine)};ronne.two_factor= ${value(theirCookie)}`,
    ])
      expect(await complete(ip(new Headers({ cookie })), totpCode(uri, { step: 1 }))).toEqual({
        ok: false,
        error: "expired",
      });
    expect(await sessions()).toBe(before);
    for (const event of await events("auth.two_factor_failed"))
      expect(event.actorId).not.toBe(otherId);
    // One cookie, with spaces around it, is still read: the code goes through.
    expect(
      (
        await complete(
          ip(new Headers({ cookie: ` ronne.two_factor = ${value(mine)} ` })),
          totpCode(uri, { step: 1 }),
        )
      ).ok,
    ).toBe(true);
  });

  it("the same backup code in two challenges at once, without any queue: one signs in, the others are a wrong code, never a 500", async () => {
    const { backupCodes } = await enrolled();
    const store = betterAuthTwoFactorStore(app.auth, app.db, app.dialect);
    const code = backupCodes[2] ?? "";
    const challenges = [await challenge(), await challenge(), await challenge()];
    const results = await Promise.all(
      challenges.map((pending) => store.verifyChallenge(pending, code, "backup_code")),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results) if (!r.ok) expect(r.error).toBe("wrong_code");
  });

  it("the same backup code in two challenges at once: one signs in, the other is a wrong code, never a 500", async () => {
    const { backupCodes } = await enrolled();
    const code = backupCodes[1] ?? "";
    const [a, b] = [await challenge(), await challenge()];
    const results = await Promise.all([
      complete(a, code, "backup_code"),
      complete(b, code, "backup_code"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "wrong_code" });
  });
});

describe("used codes across servers (no shared queue)", () => {
  it("recording one code twice at once: exactly one wins, on every database", async () => {
    const store = betterAuthTwoFactorStore(app.auth, app.db, app.dialect);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => store.spendCode(userId, "123456")),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.codeUsed(userId, "123456")).toBe(true);
    expect(await store.codeUsed(userId, "654321")).toBe(false);
  });

  it("a sign-in whose code another server recorded first gives its session back", async () => {
    const { uri } = await enrolled();
    const store = betterAuthTwoFactorStore(app.auth, app.db, app.dialect);
    // Another server records the code between this one's check and its own record.
    const deps: service.TwoFactorDeps = {
      sessions: betterAuthSessionStore(app.auth),
      repo: kyselyIdentityRepository(app.db, app.dialect),
      limiter: new LoginRateLimiter({ max: 1000 }),
      twoFactor: { ...store, spendCode: async () => false },
    };
    const before = await sessions();
    expect(
      await service.completeTwoFactorSignIn(
        deps,
        { headers: await challenge(), ip: null },
        { code: totpCode(uri, { step: 1 }), method: "totp" },
      ),
    ).toEqual({ ok: false, error: "used" });
    expect(await sessions()).toBe(before);
  });

  it("records a used code under an id keyed with AUTH_SECRET, not a plain hash of the code", async () => {
    const store = betterAuthTwoFactorStore(app.auth, app.db, app.dialect);
    expect(await store.spendCode(userId, "424242")).toBe(true);
    const row = await t.db
      .selectFrom("verification")
      .select(["id", "value"])
      .where("identifier", "=", `two-factor-used:${userId}`)
      .executeTakeFirstOrThrow();
    const plain = createHash("sha256")
      .update(`two-factor-used:${userId}:424242`)
      .digest("base64url")
      .replace(/[-_]/g, "0")
      .slice(0, 26);
    expect(row.id).toHaveLength(26);
    expect(row.id).not.toBe(plain);
    expect(row.value).toBe("");
    // Another AUTH_SECRET gives another id: the code can't be found by trying all million.
    const other = betterAuthTwoFactorStore(
      testAppAuth(t, { secret: "another-secret-another-secret-0000000" }).auth,
      app.db,
      app.dialect,
    );
    expect(await other.codeUsed(userId, "424242")).toBe(false);
  });

  it("junk in the code field is refused but not audited", async () => {
    await enrolled();
    const pending = await challenge();
    for (const junk of ["x", "", "12345", "1234567"])
      expect(await complete(pending, junk)).toEqual({ ok: false, error: "wrong_code" });
    expect(await events("auth.two_factor_failed")).toEqual([]);
  });
});

describe("turning off with a used code", () => {
  it("refuses the code that just signed in", async () => {
    const { uri } = await enrolled();
    const code = totpCode(uri, { step: 1 });
    const signedIn = await complete(await challenge(), code);
    if (!signedIn.ok) throw new Error(signedIn.error);
    const session = ip(cookieHeaders(signedIn.headers.get("set-cookie")));
    expect(await turnOffTwoFactor(session, { password, code }, app)).toEqual({
      ok: false,
      error: "used",
    });
  });
});
