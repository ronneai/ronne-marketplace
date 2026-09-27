import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import {
  changePassword,
  getCurrentUser,
  PATH_HEADER,
  requireUser,
  signIn,
  signOut,
} from "./session";

let t: TestDb;
let app: AppAuth;
let userId: string;
const email = "someone@example.com";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, { email, password });
});
afterEach(() => t.cleanup());

const signedIn = async (overrides: Partial<{ email: string; password: string }> = {}) => {
  const result = await signIn(
    new Headers(),
    { email, password, rememberMe: true, ...overrides },
    app,
  );
  if (!result.ok) throw new Error(`sign-in failed: ${result.error}`);
  return cookieHeaders(result.headers.get("set-cookie"));
};

describe("signIn", () => {
  it("signs in with the right email and password, whatever the email's case", async () => {
    const headers = await signedIn({ email: "  SomeOne@Example.com " });
    expect((await getCurrentUser(headers, app))?.id).toBe(userId);
  });

  it("gives the same answer for a wrong password, an unknown email, a disabled user and junk", async () => {
    const attempt = (e: string, p: string) =>
      signIn(new Headers(), { email: e, password: p, rememberMe: false }, testAppAuth(t));
    const invalid = { ok: false, error: "invalid_credentials" };
    expect(await attempt(email, "wrong horse battery")).toEqual(invalid);
    expect(await attempt("nobody@example.com", password)).toEqual(invalid);
    expect(await attempt("not an email", password)).toEqual(invalid);
    expect(await attempt(email, "x".repeat(129))).toEqual(invalid);
    expect(await attempt("x".repeat(250) + "@example.com", password)).toEqual(invalid);

    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    expect(await attempt(email, password)).toEqual(invalid);
    const sessions = await t.db.selectFrom("session").select("id").execute();
    expect(sessions).toHaveLength(0);
  });

  it("refuses the 6th attempt in a minute for one email, even with the right password", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await signIn(
        new Headers(),
        { email, password: "wrong horse battery", rememberMe: false },
        app,
      );
      expect(r).toEqual({ ok: false, error: "invalid_credentials" });
    }
    const sixth = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    expect(sixth).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("limits per IP only with TRUST_PROXY, using the address the proxy added", async () => {
    const fromProxy = new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    const attempts = async (a: AppAuth) => {
      const results = [];
      for (let i = 0; i < 6; i++) {
        const r = await signIn(
          fromProxy,
          { email: `u${i}@example.com`, password, rememberMe: false },
          a,
        );
        results.push(r.ok ? "ok" : r.error);
      }
      return results;
    };
    expect(await attempts(testAppAuth(t, { trustProxy: false }))).not.toContain("rate_limited");
    expect((await attempts(testAppAuth(t, { trustProxy: true }))).at(-1)).toBe("rate_limited");
  });
});

describe("requireUser", () => {
  it("returns the user, or redirects to sign-in with the requested path", async () => {
    const headers = await signedIn();
    expect((await requireUser(headers, app)).email).toBe(email);

    const signedOut = new Headers({ [PATH_HEADER]: "/items?tab=mine" });
    await expect(requireUser(signedOut, app)).rejects.toMatchObject({
      digest: expect.stringContaining("/sign-in?next=%2Fitems%3Ftab%3Dmine"),
    });
  });
});

describe("changePassword", () => {
  it("needs the current password, and applies the length rules", async () => {
    const headers = await signedIn();
    const change = (current: string, next: string) =>
      changePassword(headers, { current, next }, app);
    expect(await change("wrong horse battery", "a brand new passphrase")).toEqual({
      ok: false,
      error: "wrong_password",
    });
    expect(await change(password, "too short")).toEqual({ ok: false, error: "too_short" });
    expect(await change(password, "x".repeat(129))).toEqual({ ok: false, error: "too_long" });
    expect(
      await changePassword(
        new Headers(),
        { current: password, next: "a brand new passphrase" },
        app,
      ),
    ).toEqual({ ok: false, error: "not_signed_in" });
    // Nothing changed: the old password still signs in.
    await signedIn();
  });

  it("keeps this session, ends the others, and the new password works", async () => {
    const here = await signedIn();
    const elsewhere = await signedIn();
    expect(
      await changePassword(here, { current: password, next: "a brand new passphrase" }, app),
    ).toEqual({ ok: true });

    expect(await getCurrentUser(elsewhere, app)).toBeNull();
    // Better Auth ends every session and starts a new one for this browser; in the app, nextCookies
    // sets its cookie. So one session is left.
    const sessions = await t.db
      .selectFrom("session")
      .select("id")
      .where("user_id", "=", userId)
      .execute();
    expect(sessions).toHaveLength(1);

    await signedIn({ password: "a brand new passphrase" });
    const old = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    expect(old.ok).toBe(false);
  });

  it("limits wrong current passwords like sign-in", async () => {
    const headers = await signedIn();
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 2 }) });
    const wrong = () =>
      changePassword(
        headers,
        { current: "wrong horse battery", next: "a brand new passphrase" },
        limited,
      );
    await wrong();
    await wrong();
    expect(await wrong()).toMatchObject({ ok: false, error: "rate_limited" });
  });
});

describe("signOut", () => {
  it("ends the session", async () => {
    const headers = await signedIn();
    await signOut(headers, app);
    expect(await getCurrentUser(headers, app)).toBeNull();
  });

  it("does nothing without a session", async () => {
    await expect(signOut(new Headers(), app)).resolves.toBeUndefined();
  });
});
