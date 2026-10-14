import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { setLoggerForTests } from "../../../log";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { authenticateToken, createMyToken, exchangePassword, revokeMyToken } from "./access-tokens";
import { signIn } from "./session";

// Feature 100: the identity domain's lines. They say what happened and to whom (the id), never the
// email typed, the password or the token.
let t: TestDb;
let app: AppAuth;
let userId: string;
let lines: Record<string, unknown>[];
const email = "someone@example.com";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, { email, password });
  lines = [];
  setLoggerForTests({
    level: "debug",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
});
afterEach(async () => {
  setLoggerForTests();
  await t.cleanup();
});

const events = (name: string) => lines.filter((line) => line.event === name);
const noPersonalData = () => {
  const all = JSON.stringify(lines);
  expect(all).not.toContain("someone");
  expect(all).not.toContain("horse");
};

describe("signing in", () => {
  it("auth.signed_in with the user's id", async () => {
    await signIn(new Headers(), { email, password, rememberMe: false }, app);
    expect(events("auth.signed_in")).toEqual([
      expect.objectContaining({ level: "info", domain: "identity", userId }),
    ]);
    noPersonalData();
  });

  it("auth.sign_in_failed with the reason, never the email", async () => {
    await signIn(new Headers(), { email, password: "wrong horse battery", rememberMe: false }, app);
    await signIn(new Headers(), { email: "not an email", password, rememberMe: false }, app);
    expect(events("auth.sign_in_failed")).toEqual([
      expect.objectContaining({ level: "warn", reason: "invalid" }),
      expect.objectContaining({ level: "warn", reason: "invalid" }),
    ]);
    noPersonalData();
  });

  it("auth.rate_limited with the limit", async () => {
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 1 }) });
    await signIn(new Headers(), { email, password: "wrong", rememberMe: false }, limited);
    await signIn(new Headers(), { email, password, rememberMe: false }, limited);
    expect(events("auth.rate_limited")).toEqual([
      expect.objectContaining({ level: "warn", limit: "sign_in" }),
    ]);
  });
});

describe("tokens", () => {
  it("token.exchanged with the user's id; a failed exchange is a failed sign-in", async () => {
    await exchangePassword({ email, password }, new Headers(), app);
    await exchangePassword({ email, password: "wrong horse battery" }, new Headers(), app);
    expect(events("token.exchanged")).toEqual([expect.objectContaining({ level: "info", userId })]);
    expect(events("auth.sign_in_failed")).toEqual([
      expect.objectContaining({ reason: "invalid", via: "cli" }),
    ]);
    noPersonalData();
    expect(JSON.stringify(lines)).not.toMatch(/rmk_[A-Za-z0-9_-]{20}/);
  });

  it("auth.rate_limited for the token exchange", async () => {
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 1 }) });
    await exchangePassword({ email, password: "wrong" }, new Headers(), limited);
    await exchangePassword({ email, password }, new Headers(), limited);
    expect(events("auth.rate_limited")).toEqual([
      expect.objectContaining({ limit: "token_exchange" }),
    ]);
  });

  it("token.rejected with the reason: unknown, revoked; no line for no token", async () => {
    const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
    if (!result.ok) throw new Error(result.error);
    const headers = cookieHeaders(result.headers.get("set-cookie"));
    const made = await createMyToken(headers, { name: "laptop" }, app);
    lines.length = 0;
    await authenticateToken(null, app);
    await authenticateToken(`rmk_${"x".repeat(43)}`, app);
    await authenticateToken("not-a-token", app);
    await revokeMyToken(headers, made.id, app);
    await authenticateToken(made.token, app);
    expect(events("token.rejected").map((line) => line.reason)).toEqual([
      "unknown",
      "unknown",
      "revoked",
    ]);
    expect(JSON.stringify(lines)).not.toContain(made.token);
  });
});
