import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { CannotModifySelfError, ForbiddenError, UserNotFoundError } from "../exceptions/errors";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import { exchangePassword } from "./access-tokens";
import { clearTwoFactorAfterRestore, endSessionsForNewSecret } from "./instance-access";
import { resetRootPassword, resetTwoFactorFromCli, twoFactorOfEmail } from "./root-account";
import { signIn } from "./session";
import { confirmTwoFactor, mustEnrol, startTwoFactor, twoFactorStatus } from "./two-factor";
import { adminListUsers, adminResetTwoFactor } from "./user-admin";

// Feature 105, task 7: turning someone's two-factor off (root on Admin › Users, the terminal,
// reset-root-password), a new AUTH_SECRET (rotate-secret, a restore), and the token exchange.
let t: TestDb;
let app: AppAuth;
const password = "correct horse battery";
const secret = "test-secret-test-secret-test-secret-00";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { secret, limiter: new LoginRateLimiter({ max: 1000 }) });
});
afterEach(() => t.cleanup());

const session = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok || result.twoFactor) throw new Error("not signed in");
  return cookieHeaders(result.headers.get("set-cookie"));
};

/** An account with two-factor on, enrolled as a person does; returns its id and session. */
const enrolled = async (email: string, role: "user" | "root" = "user") => {
  const id = await createTestUser(app, { email, password, role });
  const headers = await session(email);
  const started = await startTwoFactor(headers, { password }, app);
  if (!started.ok) throw new Error(started.error);
  const on = await confirmTwoFactor(
    headers,
    { code: totpCode(started.uri), uri: started.uri },
    app,
  );
  if (!on.ok) throw new Error(on.error);
  return { id, headers: cookieHeaders(on.headers.get("set-cookie")) };
};

const sessionsOf = async (userId: string) =>
  (await t.db.selectFrom("session").select("id").where("user_id", "=", userId).execute()).length;
const records = async () =>
  (await t.db.selectFrom("two_factor").select("user_id").execute()).length;
const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

describe("root resets someone's two-factor (Admin › Users)", () => {
  it("turns it off, ends their sessions and records it; they're held again if covered", async () => {
    await createTestUser(app, { email: "root@example.com", password, role: "root" });
    const root = await session("root@example.com");
    const someone = await enrolled("someone@example.com");
    expect(await sessionsOf(someone.id)).toBe(1);
    const listed = await adminListUsers(root, {}, app);
    expect(listed.users.find((u) => u.id === someone.id)?.twoFactor).toBe(true);

    expect(await adminResetTwoFactor(root, someone.id, app)).toEqual({
      email: "someone@example.com",
      reset: true,
    });
    expect(await records()).toBe(0);
    expect(await sessionsOf(someone.id)).toBe(0);
    const again = await session("someone@example.com");
    expect(await twoFactorStatus(again, app)).toMatchObject({ enabled: false });
    expect(await mustEnrol(again, "everyone", app)).toBe(true);
    expect(
      (await adminListUsers(root, {}, app)).users.find((u) => u.id === someone.id),
    ).toMatchObject({
      twoFactor: false,
    });
    expect(await events("user.two_factor_reset")).toMatchObject([
      { targetId: someone.id, metadata: { via: "web", sessionsEnded: 1 } },
    ]);
  });

  it("changes and records nothing for someone without it", async () => {
    await createTestUser(app, { email: "root@example.com", password, role: "root" });
    const root = await session("root@example.com");
    const id = await createTestUser(app, { email: "plain@example.com", password });
    await session("plain@example.com");
    expect(await adminResetTwoFactor(root, id, app)).toMatchObject({ reset: false });
    expect(await sessionsOf(id)).toBe(1);
    // Nor for a setup they've started and not confirmed: it isn't on, and it's theirs to finish.
    const half = await createTestUser(app, { email: "half@example.com", password });
    const halfSession = await session("half@example.com");
    expect((await startTwoFactor(halfSession, { password }, app)).ok).toBe(true);
    expect(await adminResetTwoFactor(root, half, app)).toMatchObject({ reset: false });
    expect(await records()).toBe(1);
    expect(await sessionsOf(half)).toBe(1);
    expect(await events("user.two_factor_reset")).toEqual([]);
  });

  it("isn't on your own row, nor for anyone but root; another root's is", async () => {
    const root = await enrolled("root@example.com", "root");
    const other = await enrolled("other-root@example.com", "root");
    const someone = await enrolled("someone@example.com");
    await expect(adminResetTwoFactor(root.headers, root.id, app)).rejects.toThrow(
      CannotModifySelfError,
    );
    await expect(adminResetTwoFactor(someone.headers, other.id, app)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(adminResetTwoFactor(new Headers(), someone.id, app)).rejects.toThrow(
      ForbiddenError,
    );
    expect(await records()).toBe(3);
    expect(await adminResetTwoFactor(root.headers, other.id, app)).toMatchObject({ reset: true });
    expect(await records()).toBe(2);
  });
});

describe("reset-two-factor and reset-root-password (the terminal)", () => {
  it("reset-two-factor turns any account's off, with the actor cli, and says when it had none", async () => {
    const root = await enrolled("root@example.com", "root");
    expect(await twoFactorOfEmail(t.db, t.dialect, " ROOT@example.com ")).toEqual({
      email: "root@example.com",
      enabled: true,
    });
    expect(await resetTwoFactorFromCli(t.db, t.dialect, "root@example.com")).toEqual({
      email: "root@example.com",
      reset: true,
      sessionsEnded: 1,
    });
    expect(await records()).toBe(0);
    expect(await events("user.two_factor_reset")).toMatchObject([
      {
        actorId: null,
        targetId: root.id,
        metadata: { via: "cli", email: "root@example.com", sessionsEnded: 1 },
      },
    ]);
    expect(await resetTwoFactorFromCli(t.db, t.dialect, "root@example.com")).toMatchObject({
      reset: false,
    });
    expect(await events("user.two_factor_reset")).toHaveLength(1);
    await expect(resetTwoFactorFromCli(t.db, t.dialect, "nobody@example.com")).rejects.toThrow(
      UserNotFoundError,
    );
  });

  it("finds a setup started and not confirmed, and resets it", async () => {
    await createTestUser(app, { email: "half@example.com", password });
    expect((await startTwoFactor(await session("half@example.com"), { password }, app)).ok).toBe(
      true,
    );
    expect(await twoFactorOfEmail(t.db, t.dialect, "half@example.com")).toMatchObject({
      enabled: true,
    });
    expect(await resetTwoFactorFromCli(t.db, t.dialect, "half@example.com")).toMatchObject({
      reset: true,
    });
    expect(await records()).toBe(0);
    const setup = await t.db
      .selectFrom("verification")
      .select("id")
      .where("identifier", "like", "two-factor-setup:%")
      .execute();
    expect(setup).toEqual([]);
  });

  it("reset-root-password turns that root's two-factor off too, and records it", async () => {
    const root = await enrolled("root@example.com", "root");
    expect(await resetRootPassword(t.db, t.dialect, "a brand new password")).toEqual({
      email: "root@example.com",
      twoFactorReset: true,
    });
    expect(await records()).toBe(0);
    expect(await events("user.password_reset")).toMatchObject([
      { targetId: root.id, metadata: { via: "cli", twoFactorReset: true } },
    ]);
    // Without two-factor, the event says nothing of it.
    await resetRootPassword(t.db, t.dialect, "another new password");
    expect((await events("user.password_reset"))[0]?.metadata).not.toHaveProperty("twoFactorReset");
  });
});

describe("a new AUTH_SECRET", () => {
  it("rotate-secret turns every account's two-factor off and counts them", async () => {
    await enrolled("a@example.com");
    await enrolled("b@example.com");
    let written = false;
    expect(
      await endSessionsForNewSecret(t.db, t.dialect, () => {
        written = true;
      }),
    ).toEqual({ sessions: 2, twoFactorCleared: 2, providerSecrets: 0, unreadable: 0 });
    expect(written).toBe(true);
    expect(await records()).toBe(0);
    const flags = await t.db.selectFrom("user").select("two_factor_enabled").execute();
    expect(flags.every((row) => !row.two_factor_enabled)).toBe(true);
    expect(await events("instance.secret_rotated")).toMatchObject([
      { metadata: { sessionsEnded: 2, twoFactorCleared: 2 } },
    ]);
  });

  it("a settings file that can't be written changes nothing, two-factor included", async () => {
    await enrolled("a@example.com");
    await expect(
      endSessionsForNewSecret(t.db, t.dialect, () => {
        throw new Error("EACCES");
      }),
    ).rejects.toThrow("EACCES");
    expect(await records()).toBe(1);
  });

  it("a restore keeps two-factor when the server's secret is the archive's or reads it", async () => {
    await enrolled("a@example.com");
    expect(await clearTwoFactorAfterRestore(t.db, t.dialect, { archived: secret, secret })).toBe(0);
    // No secret in the archive: one stored secret is tried with the server's.
    expect(await clearTwoFactorAfterRestore(t.db, t.dialect, { secret })).toBe(0);
    expect(await records()).toBe(1);
  });

  it("a restore turns it off when the server's secret is another, or none", async () => {
    for (const secrets of [
      { archived: secret, secret: "another-secret-another-secret-another-0" },
      { secret: "another-secret-another-secret-another-0" },
      { archived: secret },
    ]) {
      const email = `${Object.keys(secrets).join("-")}@example.com`;
      await enrolled(email);
      expect(await clearTwoFactorAfterRestore(t.db, t.dialect, secrets)).toBe(1);
      expect(await records()).toBe(0);
    }
  });

  it("a restore with no two-factor at all clears nothing", async () => {
    expect(
      await clearTwoFactorAfterRestore(t.db, t.dialect, { secret: "another-secret-another-00" }),
    ).toBe(0);
  });
});

describe("POST /api/v1/auth/token with two-factor", () => {
  const exchange = (email: string, typed: string) =>
    exchangePassword({ email, password: typed }, new Headers(), app);

  it("answers two_factor_required, with no token, only after the right password", async () => {
    await enrolled("two@example.com");
    await createTestUser(app, { email: "one@example.com", password });
    expect(await exchange("two@example.com", password)).toEqual({
      ok: false,
      error: "two_factor_required",
    });
    expect(await t.db.selectFrom("access_tokens").select("id").execute()).toEqual([]);
    // A wrong password gets the same answer with and without two-factor.
    expect(await exchange("two@example.com", "wrong horse battery")).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(await exchange("one@example.com", "wrong horse battery")).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect((await exchange("one@example.com", password)).ok).toBe(true);
    expect((await events("auth.sign_in_failed")).map((e) => e.metadata.reason).sort()).toEqual([
      "invalid",
      "invalid",
      "two_factor_required",
    ]);
  });

  it("gives a token again once two-factor is reset", async () => {
    await enrolled("two@example.com");
    await resetTwoFactorFromCli(t.db, t.dialect, "two@example.com");
    expect((await exchange("two@example.com", password)).ok).toBe(true);
  });
});
