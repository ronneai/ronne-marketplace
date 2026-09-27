import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { handleAuthRequest } from "../actions/auth-http";
import {
  type Auth,
  createAuth,
  HTTP_ENDPOINTS,
  SESSION_EXPIRES_IN,
  SESSION_UPDATE_AGE,
} from "./better-auth";

let t: TestDb;
let auth: Auth;
const baseURL = "http://localhost:3000";

beforeAll(async () => {
  t = await createTestDb();
  auth = createAuth({
    db: t.db,
    dialect: t.dialect,
    secret: "test-secret-test-secret-test-secret-00",
    baseURL,
  });
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser(
    { email: "someone@example.com", name: "Someone", emailVerified: false },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash("correct horse battery"),
  });
});
afterAll(() => t.cleanup());

const request = (path: string, init: RequestInit = {}) =>
  new Request(`${baseURL}/api/auth${path}`, {
    ...init,
    headers: { origin: baseURL, "content-type": "application/json", ...init.headers },
  });
const post = (path: string, body: unknown) =>
  handleAuthRequest(request(path, { method: "POST", body: JSON.stringify(body) }), () => auth);

describe("/api/auth/*", () => {
  it("doesn't serve sign-in, sign-up or password changes over HTTP", async () => {
    const credentials = { email: "someone@example.com", password: "correct horse battery" };
    for (const path of [
      "/sign-in/email",
      "/sign-up/email",
      "/change-password",
      "/reset-password",
    ]) {
      const response = await post(path, { ...credentials, name: "X", newPassword: "x".repeat(12) });
      expect(response.status, path).toBe(404);
    }
  });

  it("serves only the allowed endpoints, of all the ones Better Auth has", async () => {
    const paths = Object.values(auth.api)
      .map((endpoint) => (endpoint as { path?: string }).path)
      .filter((path): path is string => Boolean(path));
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths.filter((p) => !HTTP_ENDPOINTS.has(p))) {
      const response = await handleAuthRequest(request(path.replace(/:\w+/g, "x")), () => auth);
      expect(response.status, path).toBe(404);
    }
    const session = await handleAuthRequest(request("/get-session"), () => auth);
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();
  });
});

describe("sessions", () => {
  it("remember me: a 30-day session with a 30-day ronne.* cookie, HttpOnly and SameSite=Lax", async () => {
    const { headers, response } = await auth.api.signInEmail({
      body: { email: "someone@example.com", password: "correct horse battery", rememberMe: true },
      returnHeaders: true,
    });
    const cookie = headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^ronne\.session_token=/);
    expect(cookie).toContain(`Max-Age=${SESSION_EXPIRES_IN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);

    const session = await t.db
      .selectFrom("session")
      .select("expires_at")
      .where("token", "=", response.token)
      .executeTakeFirstOrThrow();
    const days = (new Date(session.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
    expect(SESSION_UPDATE_AGE).toBe(86_400);
  });

  it("without remember me: a browser-session cookie (no Max-Age)", async () => {
    const { headers } = await auth.api.signInEmail({
      body: { email: "someone@example.com", password: "correct horse battery", rememberMe: false },
      returnHeaders: true,
    });
    const sessionCookie = (headers.get("set-cookie") ?? "")
      .split(/,(?=\s*[\w.-]+=)/)
      .find((c) => c.trim().startsWith("ronne.session_token="));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).not.toMatch(/Max-Age/i);
  });

  it("marks cookies Secure when PUBLIC_URL is https", async () => {
    const secure = createAuth({
      db: t.db,
      dialect: t.dialect,
      secret: "test-secret-test-secret-test-secret-00",
      baseURL: "https://ronne.example.com",
    });
    const { headers } = await secure.api.signInEmail({
      body: { email: "someone@example.com", password: "correct horse battery" },
      returnHeaders: true,
    });
    expect(headers.get("set-cookie")).toMatch(/^__Secure-ronne\.session_token=.*Secure/i);
  });

  it("records the client IP only with TRUST_PROXY", async () => {
    const signIn = async (trustProxy: boolean) => {
      const a = createAuth({
        db: t.db,
        dialect: t.dialect,
        secret: "test-secret-test-secret-test-secret-00",
        baseURL,
        trustProxy,
      });
      const { token } = await a.api.signInEmail({
        body: { email: "someone@example.com", password: "correct horse battery" },
        headers: new Headers({ "x-forwarded-for": "203.0.113.9" }),
      });
      const row = await t.db
        .selectFrom("session")
        .select("ip_address")
        .where("token", "=", token)
        .executeTakeFirstOrThrow();
      return row.ip_address;
    };
    expect(await signIn(false)).toBeFalsy();
    expect(await signIn(true)).toBe("203.0.113.9");
  });
});
