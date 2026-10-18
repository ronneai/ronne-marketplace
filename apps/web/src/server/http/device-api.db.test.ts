import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { authenticateToken } from "../domains/identity/actions/access-tokens";
import { handleAuthRequest } from "../domains/identity/actions/auth-http";
import {
  createDeviceLimiters,
  type DeviceLimiters,
  deviceDeps,
} from "../domains/identity/actions/device-grants";
import { getCurrentUser, signIn } from "../domains/identity/actions/session";
import { hashToken, MAX_ACTIVE_TOKENS } from "../domains/identity/models/access-token";
import type { CurrentUser } from "../domains/identity/models/user";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyTokenRepository } from "../domains/identity/repositories/kysely-token-repository";
import { approveDeviceGrant, denyDeviceGrant } from "../domains/identity/services/device-grants";
import { cookieHeaders, createTestUser, testAppAuth } from "../domains/identity/testing/test-auth";
import { postDeviceCode, postDeviceToken } from "./device-api";

let t: TestDb;
let app: AppAuth;
let limiters: DeviceLimiters;
let clock: Date;
let ana: CurrentUser;
let anaCookies: Headers;
const BASE = "http://localhost:3000/api/v1/auth/device";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date();
  limiters = createDeviceLimiters(() => clock.getTime());
  await createTestUser(app, { email: "ana@example.com", password });
  const signedIn = await signIn(
    new Headers(),
    { email: "ana@example.com", password, rememberMe: false },
    app,
  );
  if (!signedIn.ok) throw new Error(signedIn.error);
  anaCookies = cookieHeaders(signedIn.headers.get("set-cookie"));
  ana = (await getCurrentUser(anaCookies, app)) as CurrentUser;
});
afterEach(() => t.cleanup());

const options = () => ({ limiters, now: () => clock });

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${BASE}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const start = (
  body: unknown = { client_id: "rmk" },
  headers: Record<string, string> = {},
  a = app,
) => postDeviceCode(post("code", body, headers), a, options());

type Started = { device_code: string; user_code: string };

const started = async (): Promise<Started> => (await (await start()).json()) as Started;

const poll = (
  grant: Started,
  body: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) =>
  postDeviceToken(
    post(
      "token",
      { grant_type: GRANT_TYPE, device_code: grant.device_code, client_id: "rmk", ...body },
      headers,
    ),
    app,
    options(),
  );

const errorCode = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

const advance = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};

describe("POST /api/v1/auth/device/code", () => {
  it("answers RFC 8628's fields, never cached and with no cookie", async () => {
    const response = await start({ client_id: "rmk" }, { cookie: anaCookies.get("cookie") ?? "" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      device_code: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      user_code: expect.stringMatching(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/),
      verification_uri: "http://localhost:3000/device",
      verification_uri_complete: `http://localhost:3000/device?user_code=${body.user_code}`,
      expires_in: 600,
      interval: 5,
    });
    // The signed-in browser's cookie made no difference: nobody is bound to the code.
    const row = await t.db.selectFrom("device_grants").selectAll().executeTakeFirstOrThrow();
    expect(row.user_id).toBeNull();
  });

  it("builds the address from the instance's base URL, never from the request's host", async () => {
    const response = await postDeviceCode(
      new Request("https://evil.example/api/v1/auth/device/code", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "evil.example",
          "x-forwarded-host": "evil.example",
        },
        body: JSON.stringify({ client_id: "rmk" }),
      }),
      app,
      options(),
    );
    const body = (await response.json()) as { verification_uri: string };
    expect(body.verification_uri).toBe("http://localhost:3000/device");
  });

  it("refuses an unknown client_id and malformed bodies", async () => {
    const cases: [unknown, string][] = [
      [{ client_id: "someone-else" }, "invalid_client"],
      [{}, "invalid_request"],
      [{ client_id: 1 }, "invalid_request"],
      [{ client_id: "rmk", name: ["x"] }, "invalid_request"],
      ["not json", "invalid_request"],
      ["[1, 2]", "invalid_request"],
    ];
    for (const [body, code] of cases) {
      const response = await start(body);
      expect(response.status).toBe(400);
      expect(await errorCode(response)).toBe(code);
    }
    expect(await t.db.selectFrom("device_grants").select("id").execute()).toEqual([]);
  });

  it("limits starts per client address behind a trusted proxy, and shares one bucket without", async () => {
    const proxied = testAppAuth(t, { trustProxy: true });
    for (let i = 0; i < 10; i++)
      expect((await start(undefined, { "x-forwarded-for": "203.0.113.1" }, proxied)).status).toBe(
        200,
      );
    const limited = await start(undefined, { "x-forwarded-for": "203.0.113.1" }, proxied);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await start(undefined, { "x-forwarded-for": "203.0.113.2" }, proxied)).status).toBe(
      200,
    );

    // Without a trusted proxy the header means nothing: everyone shares 60 a minute.
    for (let i = 0; i < 60; i++) await start(undefined, { "x-forwarded-for": `198.51.100.${i}` });
    expect((await start(undefined, { "x-forwarded-for": "198.51.100.99" })).status).toBe(429);
    advance(61);
    expect((await start()).status).toBe(200);
  });
});

describe("POST /api/v1/auth/device/token", () => {
  it("answers each state of the flow with RFC 8628's codes, then the token once", async () => {
    const grant = await started();
    const pending = await poll(grant);
    expect(pending.status).toBe(400);
    expect(pending.headers.get("cache-control")).toBe("no-store");
    expect(await errorCode(pending)).toBe("authorization_pending");
    expect(await errorCode(await poll(grant))).toBe("slow_down");

    advance(11);
    await approveDeviceGrant(deviceDeps(app), { user: ana, ip: null }, grant.user_code);
    const done = await poll(grant, {}, { cookie: anaCookies.get("cookie") ?? "" });
    expect(done.status).toBe(200);
    expect(done.headers.get("cache-control")).toBe("no-store");
    expect(done.headers.get("set-cookie")).toBeNull();
    const body = (await done.json()) as {
      token: string;
      id: string;
      name: string;
      expiresAt: string;
    };
    expect(body).toEqual({
      token: expect.stringMatching(/^rmk_/),
      id: expect.any(String),
      name: "rmk",
      expiresAt: expect.any(String),
    });
    const checked = await authenticateToken(body.token, app);
    expect(checked.ok && checked.value.user.id).toBe(ana.id);

    advance(11);
    expect(await errorCode(await poll(grant))).toBe("invalid_grant");
  });

  it("answers access_denied, expired_token and invalid_grant", async () => {
    const denied = await started();
    await denyDeviceGrant(deviceDeps(app), { user: ana, ip: null }, denied.user_code);
    expect(await errorCode(await poll(denied))).toBe("access_denied");

    const expiring = await started();
    advance(601);
    expect(await errorCode(await poll(expiring))).toBe("expired_token");
    expect(await errorCode(await poll({ ...expiring, device_code: "nope" }))).toBe("invalid_grant");
  });

  it("answers user_disabled and token_limit", async () => {
    const grant = await started();
    await approveDeviceGrant(deviceDeps(app), { user: ana, ip: null }, grant.user_code);
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(clock, t.dialect) })
      .where("id", "=", ana.id)
      .execute();
    expect(await errorCode(await poll(grant))).toBe("user_disabled");
    await t.db.updateTable("user").set({ disabled_at: null }).where("id", "=", ana.id).execute();

    const repo = kyselyTokenRepository(t.db, t.dialect);
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++)
      await repo.insert({
        userId: ana.id,
        name: `t${i}`,
        tokenHash: hashToken(`seed-${i}`),
        tokenPrefix: "rmk_seed0000",
        expiresAt: null,
        createdAt: clock,
        via: "web",
      });
    const full = await started();
    await approveDeviceGrant(deviceDeps(app), { user: ana, ip: null }, full.user_code);
    const limited = await poll(full);
    expect(limited.status).toBe(400);
    expect(await errorCode(limited)).toBe("token_limit");
  });

  it("refuses malformed bodies, another grant type and an unknown client_id", async () => {
    const grant = await started();
    expect(await errorCode(await poll(grant, { client_id: "other" }))).toBe("invalid_client");
    expect(await errorCode(await poll(grant, { grant_type: "password" }))).toBe(
      "unsupported_grant_type",
    );
    expect(await errorCode(await poll(grant, { device_code: 7 }))).toBe("invalid_request");
    expect(await errorCode(await poll(grant, { grant_type: undefined }))).toBe("invalid_request");
    const notJson = await postDeviceToken(post("token", "{"), app, options());
    expect(notJson.status).toBe(400);
    expect(await errorCode(notJson)).toBe("invalid_request");
  });

  it("limits polling per client address", async () => {
    const proxied = testAppAuth(t, { trustProxy: true });
    const pollAs = () =>
      postDeviceToken(
        post(
          "token",
          { grant_type: GRANT_TYPE, device_code: "x", client_id: "rmk" },
          { "x-forwarded-for": "203.0.113.9" },
        ),
        proxied,
        options(),
      );
    for (let i = 0; i < 60; i++) expect((await pollAs()).status).toBe(400);
    expect((await pollAs()).status).toBe(429);
  });

  it("shares one polling bucket of 600 a minute without a trusted proxy, whatever the header says", async () => {
    const pollFrom = (n: number) =>
      postDeviceToken(
        post(
          "token",
          { grant_type: GRANT_TYPE, device_code: "x", client_id: "rmk" },
          { "x-forwarded-for": `198.51.${Math.floor(n / 250)}.${n % 250}` },
        ),
        app,
        options(),
      );
    for (let i = 0; i < 600; i++) expect((await pollFrom(i)).status).toBe(400);
    expect((await pollFrom(600)).status).toBe(429);
  });
});

describe("Better Auth's device routes", () => {
  it("aren't served: /api/auth/device/* is a 404", async () => {
    for (const path of ["device/code", "device/token", "device", "device/approve", "device/deny"]) {
      const response = await handleAuthRequest(
        new Request(`http://localhost:3000/api/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ client_id: "rmk" }),
        }),
        () => app.auth,
      );
      expect(response.status).toBe(404);
    }
    expect(Object.keys(app.auth.api).filter((name) => name.startsWith("device"))).toEqual([]);
  });
});
