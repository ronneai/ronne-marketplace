import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { hashToken, MAX_ACTIVE_TOKENS } from "../models/access-token";
import {
  DEVICE_GRANT_KEEP_MS,
  DEVICE_GRANT_TYPE,
  formatUserCode,
  hashDeviceCode,
  USER_CODE_ALPHABET,
} from "../models/device-grant";
import type { CurrentUser } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyDeviceGrantRepository } from "../repositories/kysely-device-grant-repository";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselyTokenRepository } from "../repositories/kysely-token-repository";
import { createTestUser, testAppAuth } from "../testing/test-auth";
import { authenticateToken } from "./access-tokens";
import {
  approveDeviceGrant,
  type DeviceGrantDeps,
  denyDeviceGrant,
  describeDeviceGrant,
  exchangeDeviceCode,
  type StartedGrant,
  startDeviceGrant,
} from "./device-grants";

let t: TestDb;
let app: AppAuth;
let clock: Date;
let deps: DeviceGrantDeps;
let ana: CurrentUser;
let ben: CurrentUser;

const advance = (seconds: number) => {
  clock = new Date(clock.getTime() + seconds * 1000);
};

const asUser = async (email: string) => {
  const id = await createTestUser(app, { email, password: "correct horse battery" });
  const user = await kyselyIdentityRepository(t.db, t.dialect).findActiveUser(id);
  if (!user) throw new Error("no user");
  return user;
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  clock = new Date("2026-10-17T12:00:00.000Z");
  const tokens = { repo: kyselyTokenRepository(t.db, t.dialect), now: () => clock };
  deps = {
    grants: kyselyDeviceGrantRepository(t.db, t.dialect),
    identity: kyselyIdentityRepository(t.db, t.dialect),
    tokens,
    now: () => clock,
  };
  ana = await asUser("ana@example.com");
  ben = await asUser("ben@example.com");
});
afterEach(() => t.cleanup());

/** How many events of one kind, counted in the table (the audit page's list is paged). */
const count = async (action: string) =>
  (await t.db.selectFrom("audit_log").select("id").where("action", "=", action).execute()).length;

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const start = async (
  input: { clientId?: unknown; name?: unknown } = {},
  context = { ip: "203.0.113.7", userAgent: "rmk/0.9.0 (laptop; darwin)" },
): Promise<StartedGrant> => {
  const result = await startDeviceGrant(deps, { clientId: "rmk", ...input }, context);
  if (!result.ok) throw new Error(result.error);
  return result.grant;
};

const poll = (grant: StartedGrant, clientId = "rmk") =>
  exchangeDeviceCode(
    deps,
    { grantType: DEVICE_GRANT_TYPE, deviceCode: grant.deviceCode, clientId },
    { ip: "203.0.113.7" },
  );

const approve = (user: CurrentUser, code: string) =>
  approveDeviceGrant(deps, { user, ip: "198.51.100.2" }, code);

const disable = (user: CurrentUser) =>
  t.db
    .updateTable("user")
    .set({ disabled_at: toDbDate(clock, t.dialect) })
    .where("id", "=", user.id)
    .execute();

describe("startDeviceGrant", () => {
  it("stores only the device code's hash, with the name and the requester's address", async () => {
    const grant = await start();
    expect(grant).toMatchObject({ expiresIn: 600, interval: 5 });
    expect(Buffer.from(grant.deviceCode, "base64url")).toHaveLength(32);
    expect(grant.userCode).toMatch(new RegExp(`^[${USER_CODE_ALPHABET}]{8}$`));
    expect(grant.userCode).not.toMatch(/[01ILO]/);

    const row = await t.db.selectFrom("device_grants").selectAll().executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      device_code_hash: hashDeviceCode(grant.deviceCode),
      user_code: grant.userCode,
      client_id: "rmk",
      name: "rmk on laptop",
      status: "pending",
      requester_ip: "203.0.113.7",
      user_id: null,
    });
    expect(JSON.stringify(row)).not.toContain(grant.deviceCode);

    const [event] = await events("auth.device_started");
    expect(event).toMatchObject({
      actorId: null,
      ipAddress: "203.0.113.7",
      metadata: { clientId: "rmk", name: "rmk on laptop" },
    });
    expect(JSON.stringify(event)).not.toContain(grant.deviceCode);
  });

  it("takes a name, and refuses an unknown client or a bad name", async () => {
    await start({ name: " ci box " });
    expect((await t.db.selectFrom("device_grants").select("name").executeTakeFirst())?.name).toBe(
      "ci box",
    );
    const context = { ip: null, userAgent: null };
    expect(await startDeviceGrant(deps, { clientId: "other" }, context)).toEqual({
      ok: false,
      error: "invalid_client",
    });
    expect(await startDeviceGrant(deps, { clientId: 7 }, context)).toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(
      await startDeviceGrant(deps, { clientId: "rmk", name: "x".repeat(101) }, context),
    ).toEqual({ ok: false, error: "invalid_request" });
    expect(await startDeviceGrant(deps, { clientId: "rmk-mcp" }, context)).toMatchObject({
      ok: true,
    });
    expect(await startDeviceGrant(deps, { clientId: "rmk", name: "a\u0000b" }, context)).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("draws another user code when one is taken", async () => {
    const taken = await start();
    let draws = 0;
    const colliding: DeviceGrantDeps = {
      ...deps,
      grants: {
        ...deps.grants,
        insert: (row) => {
          draws += 1;
          return deps.grants.insert(draws === 1 ? { ...row, userCode: taken.userCode } : row);
        },
      },
    };
    const result = await startDeviceGrant(
      colliding,
      { clientId: "rmk" },
      { ip: null, userAgent: null },
    );
    expect(draws).toBe(2);
    expect(result.ok && result.grant.userCode).not.toBe(taken.userCode);
    expect(await t.db.selectFrom("device_grants").select("id").execute()).toHaveLength(2);
  });

  it("keeps a long name whole when it adds a number to tell it apart", async () => {
    const name = `a${"😀".repeat(99)}`;
    const grants = [await start({ name }), await start({ name })];
    const names: string[] = [];
    for (const grant of grants) {
      await approve(ana, grant.userCode);
      const result = await poll(grant);
      if (!result.ok) throw new Error(result.error);
      names.push(result.token.name);
    }
    expect(names[0]).toBe(name);
    expect(names[1]).toBe(`a${"😀".repeat(95)} (2)`);
    expect(names[1]).not.toContain("\uFFFD");
  });
});

describe("exchangeDeviceCode", () => {
  it("answers authorization_pending, then slow_down when polled too soon, growing the interval", async () => {
    const grant = await start();
    expect(await poll(grant)).toEqual({ ok: false, error: "authorization_pending" });
    advance(2);
    expect(await poll(grant)).toEqual({ ok: false, error: "slow_down" });
    const row = await t.db.selectFrom("device_grants").selectAll().executeTakeFirstOrThrow();
    expect(row.interval_seconds).toBe(10);
    advance(6);
    expect(await poll(grant)).toEqual({ ok: false, error: "slow_down" });
    advance(15);
    expect(await poll(grant)).toEqual({ ok: false, error: "authorization_pending" });
  });

  it("gives a working 90-day token once, after approval, and no session", async () => {
    const grant = await start();
    const sessions = await t.db.selectFrom("session").select("id").execute();
    expect(await approve(ana, grant.userCode)).toEqual({ ok: true });

    const result = await poll(grant);
    if (!result.ok) throw new Error(result.error);
    expect(result.token.name).toBe("rmk on laptop");
    expect(
      Math.round(((result.token.expiresAt?.getTime() ?? 0) - clock.getTime()) / 86_400_000),
    ).toBe(90);
    const checked = await authenticateToken(deps.tokens, result.token.token);
    expect(checked.ok && checked.value.user.id).toBe(ana.id);
    expect(await t.db.selectFrom("session").select("id").execute()).toEqual(sessions);

    const token = await t.db
      .selectFrom("access_tokens")
      .selectAll()
      .where("id", "=", result.token.id)
      .executeTakeFirstOrThrow();
    expect(token.created_via).toBe("device");
    const [created] = await events("access_token.created");
    expect(created).toMatchObject({ actorId: ana.id, metadata: { via: "device" } });
    const [approved] = await events("auth.device_approved");
    expect(approved).toMatchObject({
      actorId: ana.id,
      ipAddress: "198.51.100.2",
      metadata: { clientId: "rmk", name: "rmk on laptop", requesterIp: "203.0.113.7" },
    });

    // Reused: the code is spent.
    advance(10);
    expect(await poll(grant)).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("answers access_denied after Deny", async () => {
    const grant = await start();
    expect(await denyDeviceGrant(deps, { user: ana, ip: null }, grant.userCode)).toEqual({
      ok: true,
    });
    expect(await poll(grant)).toEqual({ ok: false, error: "access_denied" });
    expect(await events("auth.device_denied")).toHaveLength(1);
    // Decided: it can't be approved afterwards.
    expect(await approve(ana, grant.userCode)).toEqual({ ok: false, error: "invalid_code" });
  });

  it("answers expired_token past the expiry, audits it once, and forgets it a day later", async () => {
    const grant = await start();
    advance(600);
    expect(await poll(grant)).toEqual({ ok: false, error: "expired_token" });
    advance(10);
    expect(await poll(grant)).toEqual({ ok: false, error: "expired_token" });
    const [expired] = await events("auth.device_expired");
    expect(await events("auth.device_expired")).toHaveLength(1);
    expect(expired).toMatchObject({ metadata: { name: "rmk on laptop" } });
    expect(await approve(ana, grant.userCode)).toEqual({ ok: false, error: "invalid_code" });

    advance(DEVICE_GRANT_KEEP_MS / 1000 + 1);
    await start();
    expect(await poll(grant)).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("audits a grant nobody polled once it expired, when the next code is asked for", async () => {
    const approvedUnused = await start();
    await approve(ana, approvedUnused.userCode);
    await start();
    advance(601);
    await start();
    expect(await events("auth.device_expired")).toHaveLength(2);
    await start();
    expect(await events("auth.device_expired")).toHaveLength(2);
    expect(await poll(approvedUnused)).toEqual({ ok: false, error: "expired_token" });
  });

  it("audits an expiry once when polls and a start race past it", async () => {
    const grant = await start();
    advance(601);
    const [first, second] = await Promise.all([poll(grant), poll(grant), start()]);
    expect(first.ok || second.ok).toBe(false);
    expect(await events("auth.device_expired")).toHaveLength(1);
  });

  it("audits every unused grant before it's pruned, past the sweep's 50 a start", async () => {
    for (let i = 0; i < 60; i++) await start();
    advance(600 + DEVICE_GRANT_KEEP_MS / 1000 + 5);
    await start();
    expect(await count("auth.device_expired")).toBe(50);
    // The 50 swept were audited, then pruned; the 10 still pending wait for the next start.
    expect(await t.db.selectFrom("device_grants").select("id").execute()).toHaveLength(11);
    await start();
    expect(await count("auth.device_expired")).toBe(60);
    expect(await t.db.selectFrom("device_grants").select("id").execute()).toHaveLength(2);
  });

  it("refuses a disabled user at approval, and again at exchange", async () => {
    const first = await start();
    await disable(ana);
    expect(await approve(ana, first.userCode)).toEqual({ ok: false, error: "user_disabled" });
    expect(await poll(first)).toEqual({ ok: false, error: "authorization_pending" });

    const second = await start();
    expect(await approve(ben, second.userCode)).toEqual({ ok: true });
    await disable(ben);
    expect(await poll(second)).toEqual({ ok: false, error: "user_disabled" });
    expect(await events("access_token.created")).toEqual([]);
  });

  it("answers token_limit for the 51st active token, and the code is spent", async () => {
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
    const grant = await start();
    expect(await approve(ana, grant.userCode)).toEqual({ ok: true });
    expect(await poll(grant)).toEqual({ ok: false, error: "token_limit" });
    advance(10);
    expect(await poll(grant)).toEqual({ ok: false, error: "invalid_grant" });
  });

  it("makes one token when two polls exchange at once", async () => {
    const grant = await start();
    await approve(ana, grant.userCode);
    const results = await Promise.all([poll(grant), poll(grant)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const tokens = await t.db.selectFrom("access_tokens").select("id").execute();
    expect(tokens).toHaveLength(1);
  });

  it("refuses an unknown code, another client, and malformed requests", async () => {
    const grant = await start();
    expect(await poll({ ...grant, deviceCode: "not-a-code" })).toEqual({
      ok: false,
      error: "invalid_grant",
    });
    expect(await poll(grant, "rmk-mcp")).toEqual({ ok: false, error: "invalid_grant" });
    expect(await poll(grant, "other")).toEqual({ ok: false, error: "invalid_client" });
    const context = { ip: null };
    expect(
      await exchangeDeviceCode(
        deps,
        { grantType: "password", deviceCode: grant.deviceCode, clientId: "rmk" },
        context,
      ),
    ).toEqual({ ok: false, error: "unsupported_grant_type" });
    expect(
      await exchangeDeviceCode(
        deps,
        { grantType: DEVICE_GRANT_TYPE, deviceCode: 5, clientId: "rmk" },
        context,
      ),
    ).toEqual({ ok: false, error: "invalid_request" });
  });
});

describe("approving", () => {
  it("shows what asked, for a code typed in any case, with or without the dash", async () => {
    const grant = await start();
    const typed = formatUserCode(grant.userCode).toLowerCase();
    const found = await describeDeviceGrant(deps, { user: ana, ip: null }, ` ${typed} `);
    expect(found).toEqual({
      ok: true,
      request: {
        userCode: grant.userCode,
        clientId: "rmk",
        name: "rmk on laptop",
        requesterIp: "203.0.113.7",
        createdAt: clock,
        expiresAt: new Date(clock.getTime() + 600_000),
      },
    });
    expect(await approve(ana, typed)).toEqual({ ok: true });
  });

  it("never fails when decisions, polls and wrong codes run at once", async () => {
    // MySQL ends some of these in a deadlock; the repository runs the statement again.
    for (let round = 0; round < 3; round++) {
      const grants: StartedGrant[] = [];
      for (let i = 0; i < 8; i++) grants.push(await start());
      const work = grants.flatMap((grant, i) => [
        i % 2
          ? approve(ana, grant.userCode)
          : denyDeviceGrant(deps, { user: ben, ip: null }, grant.userCode),
        poll(grant),
        describeDeviceGrant(
          deps,
          { user: ben, ip: null },
          `ABCDEFG${USER_CODE_ALPHABET[(i + round * 8) % USER_CODE_ALPHABET.length]}`,
        ),
      ]);
      const settled = await Promise.allSettled(work);
      expect(settled.filter((s) => s.status === "rejected")).toEqual([]);
      advance(10);
    }
  });

  it("lets only the first of two approvals at once count", async () => {
    const grant = await start();
    const results = await Promise.all([approve(ana, grant.userCode), approve(ben, grant.userCode)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "invalid_code" }]);
    expect(await events("auth.device_approved")).toHaveLength(1);
  });

  it("voids every pending code after 5 wrong codes, but not for malformed, used or expired ones", async () => {
    const pending = await start();
    const used = await start();
    await denyDeviceGrant(deps, { user: ben, ip: null }, used.userCode);
    const expiring = await start();
    advance(300);
    const fresh = await start();
    const approvedFresh = await start();
    expect(await approve(ben, approvedFresh.userCode)).toEqual({ ok: true });
    advance(301);
    // Expired by now, but its row is still kept.
    expect(await approve(ana, expiring.userCode)).toEqual({ ok: false, error: "invalid_code" });
    for (let i = 0; i < 3; i++) {
      expect(await approve(ana, used.userCode)).toEqual({ ok: false, error: "invalid_code" });
      expect(await approve(ana, "ABC")).toEqual({ ok: false, error: "invalid_code" });
      expect(await approve(ana, "ABCD-EFG!")).toEqual({ ok: false, error: "invalid_code" });
    }
    const wrong = (n: number) => `${"ABCDEFGH".slice(0, 7)}${USER_CODE_ALPHABET[n]}`;
    for (let i = 0; i < 4; i++) await describeDeviceGrant(deps, { user: ana, ip: null }, wrong(i));
    expect(
      (
        await t.db
          .selectFrom("device_grants")
          .select("failed_attempts")
          .where("user_code", "=", fresh.userCode)
          .executeTakeFirstOrThrow()
      ).failed_attempts,
    ).toBe(4);
    expect(await describeDeviceGrant(deps, { user: ben, ip: null }, fresh.userCode)).toMatchObject({
      ok: true,
    });

    await approve(ben, wrong(4));
    expect(await approve(ben, fresh.userCode)).toEqual({ ok: false, error: "invalid_code" });
    expect(await poll(fresh)).toEqual({ ok: false, error: "expired_token" });
    // A code that expired before the wrong entries isn't voided, only expired.
    expect(await poll(pending)).toEqual({ ok: false, error: "expired_token" });
    const statuses = await t.db
      .selectFrom("device_grants")
      .select(["user_code", "status"])
      .execute();
    const [voided] = await events("auth.device_voided");
    expect(voided).toMatchObject({ actorId: ben.id, metadata: { count: 1 } });
    expect(Object.fromEntries(statuses.map((r) => [r.user_code, r.status]))).toEqual({
      [pending.userCode]: "expired",
      [used.userCode]: "denied",
      // Past its expiry, but neither polled nor swept yet: the next start marks it.
      [expiring.userCode]: "pending",
      [fresh.userCode]: "voided",
      // Decided before the wrong codes: only pending codes are voided.
      [approvedFresh.userCode]: "approved",
    });
    // Only pending, unexpired grants counted the wrong codes.
    const attempts = await t.db
      .selectFrom("device_grants")
      .select(["user_code", "failed_attempts"])
      .execute();
    expect(
      Object.fromEntries(attempts.map((r) => [r.user_code, Number(r.failed_attempts)])),
    ).toEqual({
      [pending.userCode]: 0,
      [used.userCode]: 0,
      [expiring.userCode]: 0,
      [fresh.userCode]: 5,
      [approvedFresh.userCode]: 0,
    });
    expect(await poll(approvedFresh)).toMatchObject({ ok: true });
  });
});
