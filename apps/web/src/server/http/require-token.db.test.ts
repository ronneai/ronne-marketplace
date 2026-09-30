import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import {
  authenticateToken,
  createMyToken,
  revokeMyToken,
} from "../domains/identity/actions/access-tokens";
import { signIn } from "../domains/identity/actions/session";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { bearerToken, requireToken, type TokenGuardDeps } from "./require-token";

let t: TestDb;
let app: AppAuth;
let session: Headers;
let userId: string;
let guard: TokenGuardDeps;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  userId = await createTestUser(app, { email: "u@example.com", password });
  const result = await signIn(
    new Headers(),
    { email: "u@example.com", password, rememberMe: false },
    app,
  );
  if (!result.ok) throw new Error(result.error);
  session = cookieHeaders(result.headers.get("set-cookie"));
  guard = { ready: async () => true, authenticate: (token) => authenticateToken(token, app) };
});
afterEach(() => t.cleanup());

const call = (headers: Record<string, string>) =>
  requireToken(new Request("http://localhost:3000/api/v1/me", { headers }), guard);

const failure = async (headers: Record<string, string>) => {
  const result = await call(headers);
  if (result.ok) throw new Error("expected a failure");
  return {
    status: result.response.status,
    code: ((await result.response.json()) as { error: { code: string } }).error.code,
    auth: result.response.headers.get("www-authenticate"),
    cache: result.response.headers.get("cache-control"),
  };
};

describe("bearerToken", () => {
  it("reads only a Bearer Authorization header", () => {
    const h = (value: string) => new Headers({ authorization: value });
    expect(bearerToken(h("Bearer rmk_abc"))).toBe("rmk_abc");
    expect(bearerToken(h("bearer   rmk_abc  "))).toBe("rmk_abc");
    expect(bearerToken(h("Basic dXNlcjpwYXNz"))).toBeNull();
    expect(bearerToken(h("Bearer"))).toBeNull();
    expect(bearerToken(h("Bearer a b"))).toBeNull();
    expect(bearerToken(new Headers())).toBeNull();
  });
});

describe("requireToken", () => {
  it("accepts a valid token", async () => {
    const created = await createMyToken(session, { name: "cli" }, app);
    const result = await call({ authorization: `Bearer ${created.token}` });
    expect(result).toMatchObject({
      ok: true,
      auth: { user: { id: userId }, token: { id: created.id } },
    });
  });

  it("answers each failure with its code, a 401, WWW-Authenticate and no-store", async () => {
    expect(await failure({})).toEqual({
      status: 401,
      code: "token_missing",
      auth: 'Bearer realm="ronne"',
      cache: "no-store",
    });
    expect(await failure({ authorization: "Basic dXNlcjpwYXNz" })).toMatchObject({
      code: "token_missing",
    });
    expect(await failure({ authorization: "Bearer nope" })).toMatchObject({
      code: "token_invalid",
      auth: 'Bearer realm="ronne", error="invalid_token"',
    });
    expect(await failure({ authorization: `Bearer rmk_${"x".repeat(43)}` })).toMatchObject({
      code: "token_invalid",
    });

    const expired = await createMyToken(session, { name: "old" }, app);
    await t.db
      .updateTable("access_tokens")
      .set({ expires_at: toDbDate(new Date(Date.now() - 1000), t.dialect) })
      .where("id", "=", expired.id)
      .execute();
    expect(await failure({ authorization: `Bearer ${expired.token}` })).toMatchObject({
      code: "token_expired",
    });

    const revoked = await createMyToken(session, { name: "gone" }, app);
    await revokeMyToken(session, revoked.id, app);
    expect(await failure({ authorization: `Bearer ${revoked.token}` })).toMatchObject({
      code: "token_revoked",
    });

    const live = await createMyToken(session, { name: "live" }, app);
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    expect(await failure({ authorization: `Bearer ${live.token}` })).toMatchObject({
      status: 401,
      code: "user_disabled",
    });
  });

  it("ignores cookies: a signed-in browser with no bearer gets token_missing", async () => {
    expect(await failure({ cookie: session.get("cookie") ?? "" })).toMatchObject({
      code: "token_missing",
    });
  });

  it("says setup is required before setup", async () => {
    const result = await requireToken(new Request("http://localhost:3000/api/v1/me"), {
      ...guard,
      ready: async () => false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(503);
  });

  it("never echoes the token in an error", async () => {
    const token = `rmk_${"y".repeat(43)}`;
    const result = await call({ authorization: `Bearer ${token}` });
    if (result.ok) throw new Error("expected a failure");
    expect(await result.response.text()).not.toContain(token);
  });
});
