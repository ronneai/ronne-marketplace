import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../../../db/dates";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { setPasswordSignInPolicy } from "../../settings/actions/settings";
import { ConfirmationNeededError, NoUsableProviderError } from "../../settings/exceptions/errors";
import { InvalidEmailError } from "../exceptions/errors";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import { normalizeEmail } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as sessionService from "../services/session";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { totpCode } from "../testing/totp";
import { exchangePassword } from "./access-tokens";
import {
  effectivePasswordPolicy,
  hasUsableProvider,
  passwordUsersAffected,
  signInProviders,
} from "./password-policy";
import { signIn } from "./session";
import { completeTwoFactorSignIn, confirmTwoFactor, startTwoFactor } from "./two-factor";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let app: AppAuth;
let rootHeaders: Headers;
const PASSWORD = "correct horse battery";

const insertProvider = async (fields: { enabled: boolean; tested: boolean }) => {
  const now = toDbDate(new Date(), t.dialect);
  await t.db
    .insertInto("identity_providers")
    .values({
      id: "acme",
      type: "oidc",
      preset: "okta",
      name: "Acme SSO",
      enabled: toDbBoolean(fields.enabled, t.dialect),
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: fields.tested ? now : null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
};

const setEnabled = (enabled: boolean) =>
  t.db
    .updateTable("identity_providers")
    .set({ enabled: toDbBoolean(enabled, t.dialect) })
    .execute();

const webSignIn = (email: string, password = PASSWORD) =>
  signIn(new Headers(), { email, password, rememberMe: false }, app);

const rootOnly = async () => {
  await insertProvider({ enabled: true, tested: true });
  await setPasswordSignInPolicy(rootHeaders, "root_only", true, app);
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t, { limiter: new LoginRateLimiter({ max: 1000 }) });
  await createTestUser(app, { email: "root@acme.com", password: PASSWORD, role: "root" });
  await createTestUser(app, { email: "ana@acme.com", password: PASSWORD });
  const result = await webSignIn("root@acme.com");
  if (!result.ok) throw new Error("root didn't sign in");
  rootHeaders = cookieHeaders(result.headers.get("set-cookie"));
});
afterEach(() => t.cleanup());

describe("Everyone (the default)", () => {
  it("lets everyone sign in with a password, on the web and through rmk", async () => {
    expect(await effectivePasswordPolicy(app)).toBe("everyone");
    expect((await webSignIn("ana@acme.com")).ok).toBe(true);
    expect(
      (await exchangePassword({ email: "ana@acme.com", password: PASSWORD }, new Headers(), app))
        .ok,
    ).toBe(true);
  });
});

describe("Root only", () => {
  it("refuses everyone else's password with the usual answer, and keeps root's", async () => {
    await rootOnly();
    expect(await effectivePasswordPolicy(app)).toBe("root_only");
    expect(await webSignIn("ana@acme.com")).toEqual({ ok: false, error: "invalid_credentials" });
    expect(await webSignIn("ana@acme.com", "the wrong password")).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect((await webSignIn("root@acme.com")).ok).toBe(true);
    const failed = (await listAuditEvents(t.db, t.dialect, { dir: "asc" })).events.filter(
      (e) => e.action === "auth.sign_in_failed",
    );
    expect(failed[0]?.metadata).toMatchObject({
      email: "ana@acme.com",
      reason: "password_disabled",
    });
  });

  it("answers password_sign_in_disabled to rmk for someone else's right password, and nothing more for a wrong one", async () => {
    await rootOnly();
    expect(
      await exchangePassword({ email: "ana@acme.com", password: PASSWORD }, new Headers(), app),
    ).toEqual({
      ok: false,
      error: "password_sign_in_disabled",
    });
    expect(
      await exchangePassword(
        { email: "ana@acme.com", password: "nope nope nope" },
        new Headers(),
        app,
      ),
    ).toEqual({
      ok: false,
      error: "invalid_credentials",
    });
    expect(
      (await exchangePassword({ email: "root@acme.com", password: PASSWORD }, new Headers(), app))
        .ok,
    ).toBe(true);
  });

  it("holds only while a provider is on: with none, everyone has their password back", async () => {
    await rootOnly();
    await setEnabled(false);
    expect(await effectivePasswordPolicy(app)).toBe("everyone");
    expect((await webSignIn("ana@acme.com")).ok).toBe(true);
    expect(await signInProviders(app)).toEqual([]);
    await setEnabled(true);
    expect(await signInProviders(app)).toEqual([{ id: "acme", name: "Acme SSO", preset: "okta" }]);
    expect((await webSignIn("ana@acme.com")).ok).toBe(false);
  });
});

describe("choosing Root only", () => {
  it("is refused without a provider that's on and has passed its test", async () => {
    await expect(setPasswordSignInPolicy(rootHeaders, "root_only", true, app)).rejects.toThrow(
      NoUsableProviderError,
    );
    await insertProvider({ enabled: false, tested: true });
    expect(await hasUsableProvider(app)).toBe(false);
    await expect(setPasswordSignInPolicy(rootHeaders, "root_only", true, app)).rejects.toThrow(
      NoUsableProviderError,
    );
    await t.db
      .updateTable("identity_providers")
      .set({ enabled: toDbBoolean(true, t.dialect), tested_at: null })
      .execute();
    await expect(setPasswordSignInPolicy(rootHeaders, "root_only", true, app)).rejects.toThrow(
      NoUsableProviderError,
    );
  });

  it("needs the confirm, then is audited", async () => {
    await insertProvider({ enabled: true, tested: true });
    await expect(setPasswordSignInPolicy(rootHeaders, "root_only", false, app)).rejects.toThrow(
      ConfirmationNeededError,
    );
    expect(await setPasswordSignInPolicy(rootHeaders, "root_only", true, app)).toEqual({
      changed: true,
    });
    expect(await setPasswordSignInPolicy(rootHeaders, "everyone", false, app)).toEqual({
      changed: true,
    });
    const events = (
      await listAuditEvents(t.db, t.dialect, { group: "instance", dir: "asc" })
    ).events
      .filter((e) => e.action === "instance.password_sign_in_changed")
      .map((e) => e.metadata);
    expect(events).toEqual([
      { from: "everyone", to: "root_only" },
      { from: "root_only", to: "everyone" },
    ]);
  });

  it("is root's only", async () => {
    await insertProvider({ enabled: true, tested: true });
    const result = await webSignIn("ana@acme.com");
    if (!result.ok) throw new Error("not signed in");
    await expect(
      setPasswordSignInPolicy(
        cookieHeaders(result.headers.get("set-cookie")),
        "root_only",
        true,
        app,
      ),
    ).rejects.toThrow();
  });

  it("counts who would lose their password: active, with a password, not root", async () => {
    expect(await passwordUsersAffected(app)).toBe(1);
    await createTestUser(app, { email: "bo@acme.com", password: PASSWORD });
    const cy = await createTestUser(app, { email: "cy@acme.com", password: PASSWORD });
    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", cy)
      .execute();
    expect(await passwordUsersAffected(app)).toBe(2);
  });
});

describe("Root only and the other ways in", () => {
  /** Turns two-factor on for someone; returns a backup code. */
  const enrol = async (email: string) => {
    const first = await webSignIn(email);
    if (!first.ok || first.twoFactor) throw new Error("not signed in");
    const session = cookieHeaders(first.headers.get("set-cookie"));
    const started = await startTwoFactor(session, { password: PASSWORD }, app);
    if (!started.ok) throw new Error(started.error);
    const on = await confirmTwoFactor(
      session,
      { code: totpCode(started.uri), uri: started.uri },
      app,
    );
    if (!on.ok) throw new Error(on.error);
    return started.backupCodes[0] as string;
  };

  it("refuses a two-factor challenge someone else got before the switch, and lets root's finish", async () => {
    const anaCode = await enrol("ana@acme.com");
    const rootCode = await enrol("root@acme.com");
    // Both send the right password while it's Everyone: each gets a challenge, no session yet.
    const ana = await webSignIn("ana@acme.com");
    const root = await webSignIn("root@acme.com");
    if (!ana.ok || !ana.twoFactor || !root.ok || !root.twoFactor) throw new Error("no challenge");
    await rootOnly();
    const anaHeaders = cookieHeaders(ana.headers.get("set-cookie"));
    expect(
      await completeTwoFactorSignIn(anaHeaders, { code: anaCode, method: "backup_code" }, app),
    ).toEqual({ ok: false, error: "refused" });
    const anaUser = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", anaUser.id).execute(),
    ).toHaveLength(1);
    const rootHeaders2 = cookieHeaders(root.headers.get("set-cookie"));
    expect(
      (await completeTwoFactorSignIn(rootHeaders2, { code: rootCode, method: "backup_code" }, app))
        .ok,
    ).toBe(true);
  });

  it("runs Better Auth's own sign-in on a refused address (the same work as root's), and audits a disabled one as disabled", async () => {
    await rootOnly();
    const store = betterAuthSessionStore(app.auth);
    const calls: string[] = [];
    const deps: sessionService.SessionDeps = {
      sessions: {
        ...store,
        signIn: (headers, credentials) => {
          calls.push(credentials.email);
          return store.signIn(headers, credentials);
        },
      },
      repo: kyselyIdentityRepository(t.db, t.dialect),
      limiter: new LoginRateLimiter({ max: 1000 }),
      passwordPolicy: async () => "root_only",
    };
    const context = { headers: new Headers(), ip: null };
    for (const email of ["ana@acme.com", "nobody@acme.com"])
      expect(
        await sessionService.signIn(deps, context, {
          email,
          password: PASSWORD,
          rememberMe: false,
        }),
      ).toEqual({
        ok: false,
        error: "invalid_credentials",
      });
    // Never the person's own address, and no session for anyone.
    expect(calls).toEqual(["refused@sign-in.invalid", "refused@sign-in.invalid"]);
    const anaUser = await t.db
      .selectFrom("user")
      .select("id")
      .where("email", "=", "ana@acme.com")
      .executeTakeFirstOrThrow();
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", anaUser.id).execute(),
    ).toEqual([]);
    expect(
      (
        await sessionService.signIn(deps, context, {
          email: "root@acme.com",
          password: PASSWORD,
          rememberMe: false,
        })
      ).ok,
    ).toBe(true);
    expect(calls.at(-1)).toBe("root@acme.com");

    await t.db
      .updateTable("user")
      .set({ disabled_at: toDbDate(new Date(), t.dialect) })
      .where("email", "=", "ana@acme.com")
      .execute();
    await sessionService.signIn(deps, context, {
      email: "ana@acme.com",
      password: PASSWORD,
      rememberMe: false,
    });
    const reasons = (await listAuditEvents(t.db, t.dialect, { dir: "asc" })).events
      .filter((e) => e.action === "auth.sign_in_failed")
      .map((e) => e.metadata.reason);
    expect(reasons).toEqual(["password_disabled", "invalid", "disabled"]);
  });
});

describe("the reserved address", () => {
  it("can't be any account's: .invalid addresses are refused everywhere", () => {
    for (const email of ["refused@sign-in.invalid", "Someone@Example.INVALID", "a@b.invalid "])
      expect(() => normalizeEmail(email), email).toThrow(InvalidEmailError);
    expect(normalizeEmail("ana@invalid.example")).toBe("ana@invalid.example");
  });

  it("ends at once a session someone's refused attempt opened for it, if it was put in by hand", async () => {
    await rootOnly();
    // Only possible by writing the database directly: Create user and providers refuse it.
    const reserved = await createTestUser(app, {
      email: "refused@sign-in.invalid",
      password: PASSWORD,
    });
    expect(await webSignIn("ana@acme.com")).toEqual({ ok: false, error: "invalid_credentials" });
    expect(
      await t.db.selectFrom("session").select("id").where("user_id", "=", reserved).execute(),
    ).toEqual([]);
  });
});
