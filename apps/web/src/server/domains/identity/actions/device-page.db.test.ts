import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { ForbiddenError } from "../exceptions/errors";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { listMyTokens } from "./access-tokens";
import {
  createDeviceLimiters,
  createDevicePageLimiters,
  type DevicePageLimiters,
  decideMyDeviceCode,
  describeMyDeviceCode,
  exchangeDeviceLogin,
  startDeviceLogin,
} from "./device-grants";
import { signIn } from "./session";

let t: TestDb;
let app: AppAuth;
let clock: Date;
let limiters: DevicePageLimiters;
const password = "correct horse battery";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

const headersFor = async (email: string, a: AppAuth = app, ip?: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, a);
  if (!result.ok) throw new Error(result.error);
  const headers = cookieHeaders(result.headers.get("set-cookie"));
  if (ip) headers.set("x-forwarded-for", ip);
  return headers;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date();
  limiters = createDevicePageLimiters(() => clock.getTime());
  await createTestUser(app, { email: "ana@example.com", password });
  await createTestUser(app, { email: "ben@example.com", password });
});
afterEach(() => t.cleanup());

const options = () => ({ limiters, now: () => clock });

const start = async () => {
  const result = await startDeviceLogin({ clientId: "rmk" }, new Headers(), app, {
    limiters: createDeviceLimiters(),
    now: () => clock,
  });
  if (!result.ok) throw new Error(result.error);
  return result.grant;
};

const poll = (deviceCode: string) =>
  exchangeDeviceLogin({ grantType: GRANT_TYPE, deviceCode, clientId: "rmk" }, new Headers(), app, {
    limiters: createDeviceLimiters(),
    now: () => clock,
  });

describe("the /device page's actions", () => {
  it("shows what asked, then approves for the signed-in person, and rmk gets the token", async () => {
    const grant = await start();
    const ana = await headersFor("ana@example.com");
    expect(await describeMyDeviceCode(ana, grant.userCode, app, options())).toMatchObject({
      ok: true,
      request: { userCode: grant.userCode, name: "rmk", clientId: "rmk" },
    });
    expect(await decideMyDeviceCode(ana, grant.userCode, "approve", app, options())).toMatchObject({
      ok: true,
    });
    const result = await poll(grant.deviceCode);
    expect(result.ok).toBe(true);
    const row = await t.db
      .selectFrom("device_grants")
      .innerJoin("user", "user.id", "device_grants.user_id")
      .select("user.email")
      .executeTakeFirstOrThrow();
    expect(row.email).toBe("ana@example.com");
  });

  it("denies", async () => {
    const grant = await start();
    const ana = await headersFor("ana@example.com");
    expect(await decideMyDeviceCode(ana, grant.userCode, "deny", app, options())).toMatchObject({
      ok: true,
    });
    expect(await poll(grant.deviceCode)).toEqual({ ok: false, error: "access_denied" });
  });

  it("refuses someone signed out", async () => {
    const grant = await start();
    await expect(
      describeMyDeviceCode(new Headers(), grant.userCode, app, options()),
    ).rejects.toThrow(ForbiddenError);
  });

  it("allows 10 refused codes an hour per person, wrong, used or malformed alike", async () => {
    const used = await start();
    const ana = await headersFor("ana@example.com");
    await decideMyDeviceCode(ana, used.userCode, "deny", app, options());
    const entries = ["ABC", used.userCode, "ABCDEFGH", "WDJBMJHT"];
    for (let i = 0; i < 10; i++)
      expect(
        await describeMyDeviceCode(ana, entries[i % entries.length] ?? "", app, options()),
      ).toEqual({ ok: false, error: "invalid_code" });

    // Even the right code is refused now, so the limit tells nothing about it.
    const fresh = await start();
    const limited = await describeMyDeviceCode(ana, fresh.userCode, app, options());
    expect(limited).toMatchObject({ ok: false, error: "rate_limited" });
    expect(
      limited.ok === false && "retryAfterSeconds" in limited && limited.retryAfterSeconds,
    ).toBe(3600);
    expect(await decideMyDeviceCode(ana, fresh.userCode, "approve", app, options())).toMatchObject({
      ok: false,
      error: "rate_limited",
    });

    // Another person isn't held up, and an hour later Ana isn't either.
    const ben = await headersFor("ben@example.com");
    expect(await describeMyDeviceCode(ben, fresh.userCode, app, options())).toMatchObject({
      ok: true,
    });
    clock = new Date(clock.getTime() + 3600_000);
    const later = await start();
    expect((await describeMyDeviceCode(ana, later.userCode, app, options())).ok).toBe(true);
  });

  it("holds a burst of wrong codes at the limit: they're counted before they're looked up", async () => {
    const ana = await headersFor("ana@example.com");
    const results = await Promise.all(
      Array.from({ length: 40 }, () => describeMyDeviceCode(ana, "WDJBMJHT", app, options())),
    );
    const errors = results.map((r) => (r.ok ? "ok" : r.error));
    expect(errors.filter((e) => e === "invalid_code")).toHaveLength(10);
    expect(errors.filter((e) => e === "rate_limited")).toHaveLength(30);
  });

  it("counts refused approvals and denials too", async () => {
    const ana = await headersFor("ana@example.com");
    for (let i = 0; i < 5; i++) {
      await decideMyDeviceCode(ana, "ABCDEFGH", "approve", app, options());
      await decideMyDeviceCode(ana, "ABCDEFGH", "deny", app, options());
    }
    const grant = await start();
    expect(await describeMyDeviceCode(ana, grant.userCode, app, options())).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
  });

  it("refuses a code once 5 wrong codes were counted against it, even one looked up before", async () => {
    const grant = await start();
    const ana = await headersFor("ana@example.com");
    expect((await describeMyDeviceCode(ana, grant.userCode, app, options())).ok).toBe(true);
    // As if guesses still in flight had been counted after the look-up.
    await t.db.updateTable("device_grants").set({ failed_attempts: 5 }).execute();
    expect(await decideMyDeviceCode(ana, grant.userCode, "approve", app, options())).toEqual({
      ok: false,
      error: "invalid_code",
    });
    const row = await t.db.selectFrom("device_grants").select("status").executeTakeFirstOrThrow();
    expect(row.status).toBe("pending");
  });

  it("lists the token as made by browser approval in Access tokens", async () => {
    const grant = await start();
    const ana = await headersFor("ana@example.com");
    await decideMyDeviceCode(ana, grant.userCode, "approve", app, options());
    expect((await poll(grant.deviceCode)).ok).toBe(true);
    expect((await listMyTokens(ana, app)).map((token) => [token.name, token.via])).toEqual([
      ["rmk", "device"],
    ]);
  });

  it("doesn't count codes that were right", async () => {
    const ana = await headersFor("ana@example.com");
    for (let i = 0; i < 12; i++) {
      const grant = await start();
      expect((await describeMyDeviceCode(ana, grant.userCode, app, options())).ok).toBe(true);
    }
  });

  it("allows 5 refused codes a minute per client address behind a trusted proxy", async () => {
    const proxied = testAppAuth(t, { trustProxy: true });
    const ana = await headersFor("ana@example.com", proxied, "203.0.113.5");
    const ben = await headersFor("ben@example.com", proxied, "203.0.113.5");
    for (let i = 0; i < 5; i++)
      await describeMyDeviceCode(i % 2 ? ana : ben, "ABCDEFGH", proxied, options());
    const grant = await start();
    expect(await describeMyDeviceCode(ben, grant.userCode, proxied, options())).toMatchObject({
      ok: false,
      error: "rate_limited",
    });
    const elsewhere = await headersFor("ben@example.com", proxied, "198.51.100.9");
    expect((await describeMyDeviceCode(elsewhere, grant.userCode, proxied, options())).ok).toBe(
      true,
    );
    clock = new Date(clock.getTime() + 61_000);
    expect((await describeMyDeviceCode(ben, grant.userCode, proxied, options())).ok).toBe(true);
  });
});
