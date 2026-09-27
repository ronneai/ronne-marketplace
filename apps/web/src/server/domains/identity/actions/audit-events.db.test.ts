import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { changePassword, signIn, signOut } from "./session";

// 006's events (spec 007's catalogue), recorded by the identity actions.
let t: TestDb;
let app: AppAuth;
let userId: string;
const email = "someone@example.com";
const password = "correct horse battery";
const proxied = () => new Headers({ "x-forwarded-for": "203.0.113.9" });

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { trustProxy: true });
  userId = await createTestUser(app, { email, password });
});
afterEach(() => t.cleanup());

const events = async () => (await listAuditEvents(t.db, t.dialect, {})).events;
const sessionIds = async () =>
  (await t.db.selectFrom("session").select("id").where("user_id", "=", userId).execute()).map(
    (r) => r.id,
  );

async function signedIn(rememberMe = false) {
  const result = await signIn(proxied(), { email, password, rememberMe }, app);
  if (!result.ok) throw new Error(result.error);
  const headers = cookieHeaders(result.headers.get("set-cookie"));
  headers.set("x-forwarded-for", "203.0.113.9");
  return headers;
}

describe("006's audit events", () => {
  it("auth.signed_in: the user, their new session, remember me and the IP", async () => {
    await signedIn(true);
    const [event] = await events();
    expect(event).toMatchObject({
      actorId: userId,
      action: "auth.signed_in",
      targetType: "session",
      metadata: { remember: true },
      ipAddress: "203.0.113.9",
    });
    expect(await sessionIds()).toContain(event?.targetId);
  });

  it("auth.sign_in_failed: the typed email and the reason, with no actor", async () => {
    const attempt = (e: string, p = "wrong horse battery") =>
      signIn(proxied(), { email: e, password: p, rememberMe: false }, app);
    await attempt("  SomeOne@Example.com ");
    await attempt("Nobody@Example.com");
    await attempt("not an email");

    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    await attempt(email, password);

    expect((await events()).map((e) => [e.actorId, e.action, e.targetType, e.metadata])).toEqual([
      [null, "auth.sign_in_failed", "none", { email, reason: "disabled" }],
      [null, "auth.sign_in_failed", "none", { email: "not an email", reason: "invalid" }],
      [null, "auth.sign_in_failed", "none", { email: "nobody@example.com", reason: "invalid" }],
      [null, "auth.sign_in_failed", "none", { email, reason: "invalid" }],
    ]);
  });

  it("auth.sign_in_failed: rate-limited attempts say so", async () => {
    const limited = testAppAuth(t, { trustProxy: true, limiter: new LoginRateLimiter({ max: 1 }) });
    await signIn(proxied(), { email, password: "wrong horse battery", rememberMe: false }, limited);
    await signIn(proxied(), { email, password, rememberMe: false }, limited);
    expect((await events()).map((e) => e.metadata.reason)).toEqual(["rate_limited", "invalid"]);
  });

  it("auth.signed_out: the session that ended", async () => {
    const headers = await signedIn();
    const [sessionId] = await sessionIds();
    await signOut(headers, app);
    const [event] = await events();
    expect(event).toMatchObject({
      actorId: userId,
      action: "auth.signed_out",
      targetType: "session",
      targetId: sessionId,
      ipAddress: "203.0.113.9",
    });
    // Signing out again, without a session, records nothing more.
    await signOut(headers, app);
    expect((await events()).filter((e) => e.action === "auth.signed_out")).toHaveLength(1);
  });

  it("user.password_changed: how many other sessions ended; nothing on a wrong password", async () => {
    const here = await signedIn();
    await signedIn();
    await signedIn();
    await changePassword(
      here,
      { current: "wrong horse battery", next: "a brand new passphrase" },
      app,
    );
    expect((await events()).map((e) => e.action)).not.toContain("user.password_changed");

    await changePassword(here, { current: password, next: "a brand new passphrase" }, app);
    const [event] = await events();
    expect(event).toMatchObject({
      actorId: userId,
      action: "user.password_changed",
      targetType: "user",
      targetId: userId,
      metadata: { otherSessionsEnded: 2 },
    });
  });

  it("never stores a password or a session token", async () => {
    const headers = await signedIn(true);
    await changePassword(headers, { current: password, next: "a brand new passphrase" }, app);
    await signIn(proxied(), { email, password: "wrong horse battery", rememberMe: false }, app);
    const tokens = (await t.db.selectFrom("session").select("token").execute()).map((r) => r.token);
    const stored = JSON.stringify(await t.db.selectFrom("audit_log").selectAll().execute());
    for (const secret of [password, "a brand new passphrase", "wrong horse battery", ...tokens]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("records no IP without TRUST_PROXY", async () => {
    const direct = testAppAuth(t);
    await signIn(proxied(), { email, password, rememberMe: false }, direct);
    const [event] = await events();
    expect(event?.ipAddress).toBeNull();
  });
});
