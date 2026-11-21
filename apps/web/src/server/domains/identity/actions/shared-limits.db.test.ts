import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { postDeviceCode, postDeviceToken } from "../../../http/device-api";
import { createMemoryRateLimitStore } from "../../../rate-limit/memory-store";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyScimTokenRepository } from "../repositories/kysely-scim-token-repository";
import { createScimToken, enableScim } from "../services/scim-tokens";
import {
  cookieHeaders,
  createTestUser,
  TEST_BASE_URL,
  testAppAuth,
  testRateLimitStore,
} from "../testing/test-auth";
import { createDevicePageLimiters, describeMyDeviceCode, limitedEntry } from "./device-grants";
import { createRoot } from "./root-account";
import { authenticateScim } from "./scim";
import { signIn } from "./session";
import { completeSsoSignIn, startSsoSignIn } from "./sso";

// Feature 109, task 4: provider sign-in, `rmk login --web` and SCIM count in the instance's
// database. Two app instances share one database, as two replicas (or the server before and after
// a restart) do, and nothing passes its own limiters: each limit is the one the running app uses.
let t: TestDb;
let one: AppAuth;
let two: AppAuth;
/** Two instances on the test's database; without a trusted proxy, no address is known. */
const instances = (trustProxy: boolean) => {
  const instance = () => testAppAuth(t, { trustProxy, rateLimits: testRateLimitStore(t) });
  one = instance();
  two = instance();
};
beforeEach(async () => {
  t = await createTestDb();
  instances(true);
});
afterEach(() => t.cleanup());

const from = (ip: string, init: Record<string, string> = {}) =>
  new Headers({ "x-forwarded-for": ip, ...init });
/** Ana, signed in: her session cookie. */
const anaCookie = async () => {
  const password = "correct horse battery";
  await createTestUser(one, { email: "ana@example.com", password });
  const signedIn = await signIn(
    new Headers(),
    { email: "ana@example.com", password, rememberMe: false },
    one,
  );
  if (!signedIn.ok) throw new Error(signedIn.error);
  return cookieHeaders(signedIn.headers.get("set-cookie")).get("cookie") ?? "";
};
const deviceRequest = (path: "code" | "token", ip: string | null, body: unknown) =>
  new Request(`${TEST_BASE_URL}/api/v1/auth/device/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(ip ? { "x-forwarded-for": ip } : {}) },
    body: JSON.stringify(body),
  });
const askCode = (ip: string | null, app: AppAuth) =>
  postDeviceCode(deviceRequest("code", ip, { client_id: "rmk" }), app);
const pollCode = (ip: string | null, app: AppAuth) =>
  postDeviceToken(
    deviceRequest("token", ip, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: "x",
      client_id: "rmk",
    }),
    app,
  );
/** Whether a provider sign-in start was refused by its limit. */
const limited = (result: { ok: boolean; error?: string }) =>
  !result.ok && result.error === "rate_limited";
/** Each attempt on the other instance, in turn. */
const either = (i: number) => (i % 2 === 0 ? one : two);

describe("limits shared by every instance (109)", () => {
  it("provider sign-in callbacks: 30 a minute per address", async () => {
    const callback = (i: number) =>
      completeSsoSignIn(
        new Request(`${TEST_BASE_URL}/api/auth/sso/callback/acme?state=x`, {
          headers: from("203.0.113.20"),
        }),
        "acme",
        either(i),
      );
    for (let i = 0; i < 30; i++)
      expect((await callback(i)).headers.get("location")).toContain("error=expired");
    expect((await callback(30)).headers.get("location")).toContain("error=rate_limited");
  });

  it("asking for an rmk login code: 10 a minute per address", async () => {
    const ask = (i: number) =>
      postDeviceCode(
        new Request(`${TEST_BASE_URL}/api/v1/auth/device/code`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.21" },
          body: JSON.stringify({ client_id: "rmk" }),
        }),
        either(i),
      );
    for (let i = 0; i < 10; i++) expect((await ask(i)).status).toBe(200);
    expect((await ask(10)).status).toBe(429);
  });

  it("codes typed on /device: 5 wrong a minute per address", async () => {
    const cookie = await anaCookie();
    const typed = (i: number) =>
      describeMyDeviceCode(from("203.0.113.22", { cookie }), "BCDF-GHJK", either(i));
    for (let i = 0; i < 5; i++)
      expect(await typed(i)).toMatchObject({
        ok: false,
        error: expect.not.stringMatching(/^rate_limited$/),
      });
    expect(await typed(5)).toMatchObject({ ok: false, error: "rate_limited" });
  });

  it("SCIM requests with a bad token: 20 a minute per address", async () => {
    const request = (i: number) =>
      authenticateScim(from("203.0.113.23", { authorization: "Bearer not-a-token" }), either(i));
    for (let i = 0; i < 20; i++) expect(await request(i)).toEqual({ ok: false, status: 401 });
    expect(await request(20)).toMatchObject({ ok: false, status: 429 });
  });

  it("provider sign-in starts: 30 a minute per address, apart from the callbacks", async () => {
    const start = (ip: string, i: number) =>
      startSsoSignIn(from(ip), { provider: "none" }, either(i));
    for (let i = 0; i < 30; i++) expect(limited(await start("203.0.113.30", i))).toBe(false);
    expect(limited(await start("203.0.113.30", 30))).toBe(true);
    expect(limited(await start("203.0.113.31", 31))).toBe(false);
    const callback = await completeSsoSignIn(
      new Request(`${TEST_BASE_URL}/api/auth/sso/callback/acme?state=x`, {
        headers: from("203.0.113.30"),
      }),
      "acme",
      one,
    );
    expect(callback.headers.get("location")).toContain("error=expired");
  });

  it("provider sign-in without a known address: 300 a minute for the instance", async () => {
    instances(false);
    for (let i = 0; i < 300; i++)
      expect(
        limited(
          await startSsoSignIn(from(`198.51.100.${i % 200}`), { provider: "none" }, either(i)),
        ),
      ).toBe(false);
    expect(limited(await startSsoSignIn(from("198.51.100.250"), { provider: "none" }, one))).toBe(
      true,
    );
  });

  it("polling for an rmk login code: 60 a minute per address", async () => {
    for (let i = 0; i < 60; i++)
      expect((await pollCode("203.0.113.32", either(i))).status).toBe(400);
    const refused = await pollCode("203.0.113.32", two);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("rmk login codes without a known address: 60 asked and 600 polls a minute for the instance", async () => {
    instances(false);
    for (let i = 0; i < 60; i++) expect((await askCode(null, either(i))).status).toBe(200);
    expect((await askCode(null, two)).status).toBe(429);
    for (let i = 0; i < 600; i++) expect((await pollCode(null, either(i))).status).toBe(400);
    expect((await pollCode(null, two)).status).toBe(429);
  });

  it("codes typed on /device: 10 wrong an hour per person, from any address", async () => {
    instances(false);
    const cookie = await anaCookie();
    const typed = (i: number) =>
      describeMyDeviceCode(new Headers({ cookie }), "BCDF-GHJK", either(i));
    for (let i = 0; i < 10; i++)
      expect(await typed(i)).not.toMatchObject({ error: "rate_limited" });
    const refused = await typed(10);
    expect(refused).toMatchObject({ ok: false, error: "rate_limited" });
    expect((refused as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(60);
  });

  it("codes typed on /device count against both limits or neither", async () => {
    const cookie = await anaCookie();
    const typed = (ip: string, i: number) =>
      describeMyDeviceCode(from(ip, { cookie }), "BCDF-GHJK", either(i));
    // The address's 5 used up: 20 more from it are refused, and count against Ana neither.
    for (let i = 0; i < 5; i++) await typed("203.0.113.33", i);
    for (let i = 0; i < 20; i++)
      expect(await typed("203.0.113.33", i)).toMatchObject({ error: "rate_limited" });
    // So she still has 5 of her 10, from other addresses, and then no more.
    for (let i = 0; i < 5; i++)
      expect(await typed(`203.0.113.${40 + i}`, i)).not.toMatchObject({ error: "rate_limited" });
    expect(await typed("203.0.113.50", 0)).toMatchObject({ error: "rate_limited" });
  });

  it("SCIM: 600 a minute per working token, and 100 refusals for the instance without an address", async () => {
    instances(false);
    const created = await createRoot(t.db, t.dialect, {
      email: "root@example.com",
      name: "Root",
      password: "correct horse battery",
    });
    const root = {
      id: created.id,
      email: "root@example.com",
      name: "Root",
      role: "root" as const,
      workspaces: {},
    };
    const at = toDbDate(new Date(), t.dialect);
    await t.db
      .insertInto("identity_providers")
      .values({
        id: "acme",
        type: "oidc",
        preset: "entra",
        name: "Acme",
        config: "{}",
        secret_enc: null,
        domains: "[]",
        groups_claim: null,
        tested_at: null,
        tested_by: null,
        last_signed_in_at: null,
        last_failure_at: null,
        last_failure_reason: null,
        created_by: null,
        created_at: at,
        updated_at: at,
      })
      .execute();
    const tokens = { repo: kyselyScimTokenRepository(t.db, t.dialect), now: () => new Date() };
    await enableScim(tokens, { user: root, ip: null }, "acme");
    const { token } = await createScimToken(tokens, { user: root, ip: null }, "acme");
    const bearer = (value: string) => new Headers({ authorization: `Bearer ${value}` });
    for (let i = 0; i < 600; i++)
      expect((await authenticateScim(bearer(token), either(i))).ok).toBe(true);
    expect(await authenticateScim(bearer(token), two)).toMatchObject({ ok: false, status: 429 });
    for (let i = 0; i < 100; i++)
      expect(await authenticateScim(bearer("bad"), either(i))).toEqual({ ok: false, status: 401 });
    expect(await authenticateScim(bearer("bad"), one)).toMatchObject({ ok: false, status: 429 });
  });

  it("counts them all in the database, keyed, never the address", async () => {
    await authenticateScim(from("203.0.113.24", { authorization: "Bearer x" }), one);
    const rows = await t.db.selectFrom("rate_limits").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("203.0.113");
  });
});

describe("the /device page's count of an entry (107, 109)", () => {
  const actor = { user: null, ip: "203.0.113.60" };
  const counted = async () =>
    (await t.db.selectFrom("rate_limits").select("hits").execute())
      .map((r) => Number(r.hits))
      .sort();
  const options = () => ({ limiters: createDevicePageLimiters(testRateLimitStore(t)) });

  it("keeps a refused code counted against both limits", async () => {
    await limitedEntry(actor, one, options(), async () => ({ ok: false, error: "not_found" }));
    expect(await counted()).toEqual([1, 1]);
  });

  it("gives it back when the code was right, or the account is disabled", async () => {
    await limitedEntry(actor, one, options(), async () => ({ ok: true }));
    await limitedEntry(actor, one, options(), async () => ({ ok: false, error: "user_disabled" }));
    expect(await counted()).toEqual([0, 0]);
  });

  it("gives it back when the work throws, and lets the error through", async () => {
    await expect(
      limitedEntry(actor, one, options(), async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await counted()).toEqual([0, 0]);
  });

  it("refuses two stores for its two limits", async () => {
    const mixed = {
      ip: createDevicePageLimiters(createMemoryRateLimitStore()).ip,
      person: createDevicePageLimiters(testRateLimitStore(t)).person,
    };
    await expect(
      limitedEntry(actor, one, { limiters: mixed }, async () => ({ ok: true })),
    ).rejects.toThrow(/share one store/);
  });
});
