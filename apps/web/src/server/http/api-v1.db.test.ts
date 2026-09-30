import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { listAuditEvents } from "../domains/audit/actions/audit";
import { authenticateToken } from "../domains/identity/actions/access-tokens";
import { LoginRateLimiter } from "../domains/identity/models/login-rate-limiter";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { tokenNameFromUserAgent } from "../domains/identity/services/token-exchange";
import { createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { deleteToken, getMe, postToken } from "./api-v1";
import type { TokenGuardDeps } from "./require-token";

let t: TestDb;
let app: AppAuth;
let guard: TokenGuardDeps;
let userId: string;
const email = "u@example.com";
const password = "correct horse battery";
const BASE = "http://localhost:3000/api/v1";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  guard = { ready: async () => true, authenticate: (token) => authenticateToken(token, app) };
  userId = await createTestUser(app, { email, password });
});
afterEach(() => t.cleanup());

const login = (body: unknown, headers: Record<string, string> = {}, a: AppAuth = app) =>
  postToken(
    new Request(`${BASE}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    a,
  );
const withToken = (token: string, method = "GET", path = "/me") =>
  new Request(`${BASE}${path}`, { method, headers: { authorization: `Bearer ${token}` } });
const code = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

describe("POST /api/v1/auth/token", () => {
  it("exchanges the right email and password for a 90-day token, without a web session", async () => {
    const response = await login(
      { email: " U@Example.com ", password },
      { "user-agent": "rmk/0.1.0 (laptop; darwin)" },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as { token: string; name: string; expiresAt: string };
    expect(body.token).toMatch(/^rmk_[A-Za-z0-9_-]{43}$/);
    expect(body.name).toBe("rmk on laptop");
    expect(Math.round((new Date(body.expiresAt).getTime() - Date.now()) / 86_400_000)).toBe(90);
    expect(await t.db.selectFrom("session").select("id").execute()).toEqual([]);

    const [event] = (await listAuditEvents(t.db, t.dialect, {})).events;
    expect(event).toMatchObject({
      actorId: userId,
      action: "access_token.created",
      metadata: { via: "cli" },
    });
  });

  it("names repeated logins from one machine apart, or uses the name given", async () => {
    const ua = { "user-agent": "rmk/0.1.0 (laptop)" };
    const names = [];
    for (let i = 0; i < 3; i++)
      names.push(((await (await login({ email, password }, ua)).json()) as { name: string }).name);
    expect(names).toEqual(["rmk on laptop", "rmk on laptop (2)", "rmk on laptop (3)"]);
    const named = (await (await login({ email, password, name: "ci" }, ua)).json()) as {
      name: string;
    };
    expect(named.name).toBe("ci");
  });

  it("gives the same 401 for a wrong password, an unknown email and a disabled user", async () => {
    const statuses = [];
    for (const body of [
      { email, password: "wrong horse battery" },
      { email: "nobody@example.com", password },
      { email: "not an email", password },
      { email, password: "" },
    ]) {
      const response = await login(body, {}, testAppAuth(t));
      statuses.push([response.status, await code(response)]);
    }
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", userId)
      .execute();
    const disabled = await login({ email, password }, {}, testAppAuth(t));
    statuses.push([disabled.status, await code(disabled)]);
    expect(statuses).toEqual(Array(5).fill([401, "invalid_credentials"]));
    const reasons = (await listAuditEvents(t.db, t.dialect, {})).events.map(
      (e) => e.metadata.reason,
    );
    expect(reasons[0]).toBe("disabled");
  });

  it("answers 429 once the sign-in limit is used up", async () => {
    const limited = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 2 }) });
    await login({ email, password: "wrong horse battery" }, {}, limited);
    await login({ email, password: "wrong horse battery" }, {}, limited);
    const response = await login({ email, password }, {}, limited);
    expect(response.status).toBe(429);
    expect(await code(response)).toBe("rate_limited");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("answers 400 for a body that isn't a JSON object", async () => {
    for (const body of ["not json", "[1,2]", "null"]) {
      const response = await login(body);
      expect(response.status, body).toBe(400);
      expect(await code(response)).toBe("invalid_request");
    }
  });
});

describe("GET /api/v1/me and DELETE /api/v1/auth/token", () => {
  it("returns the user and the token, then revokes it; the next call gets token_revoked", async () => {
    const created = (await (await login({ email, password, name: "cli" })).json()) as {
      token: string;
      id: string;
    };
    const me = await getMe(withToken(created.token), guard);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      id: userId,
      email,
      role: "user",
      token: { id: created.id, name: "cli" },
    });

    const revoked = await deleteToken(
      withToken(created.token, "DELETE", "/auth/token"),
      app,
      guard,
    );
    expect(revoked.status).toBe(204);
    const after = await getMe(withToken(created.token), guard);
    expect(after.status).toBe(401);
    expect(await code(after)).toBe("token_revoked");
    const actions = (await listAuditEvents(t.db, t.dialect, {})).events.map((e) => e.action);
    expect(actions[0]).toBe("access_token.revoked");
  });

  it("need a bearer token", async () => {
    const me = await getMe(new Request(`${BASE}/me`), guard);
    expect([me.status, await code(me)]).toEqual([401, "token_missing"]);
    const del = await deleteToken(
      new Request(`${BASE}/auth/token`, { method: "DELETE" }),
      app,
      guard,
    );
    expect(del.status).toBe(401);
  });
});

describe("secrets", () => {
  it("no response, audit row or error body holds a password or a plain token", async () => {
    const good = (await (await login({ email, password })).json()) as { token: string };
    const bad = await (await login({ email, password: "wrong horse battery" })).text();
    const me = await (await getMe(withToken(good.token), guard)).text();
    const audit = JSON.stringify(await t.db.selectFrom("audit_log").selectAll().execute());
    const tokens = JSON.stringify(await t.db.selectFrom("access_tokens").selectAll().execute());
    for (const [where, text] of Object.entries({ bad, me, audit, tokens })) {
      expect(text, where).not.toContain(password);
      expect(text, where).not.toContain("wrong horse battery");
      expect(text, where).not.toContain(good.token);
    }
  });
});

describe("tokenNameFromUserAgent", () => {
  it("reads rmk's host, and falls back to rmk", () => {
    expect(tokenNameFromUserAgent("rmk/0.1.0 (laptop; darwin arm64)")).toBe("rmk on laptop");
    expect(tokenNameFromUserAgent("curl/8.0")).toBe("rmk");
    expect(tokenNameFromUserAgent(null)).toBe("rmk");
  });
});
