import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../../../db/create-db";
import { toDbDate } from "../../../db/dates";
import { migrateToLatest } from "../../../db/migrate";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { runResetRootPassword } from "../../../setup/reset-root";
import { SetupFailedError } from "../../../setup/run-setup";
import { scriptedPrompts } from "../../../setup/testing/scripted-prompts";
import { listAuditEvents } from "../../audit/actions/audit";
import { RootNotFoundError, UserErasedError } from "../exceptions/errors";
import { erasedEmail, erasedName, isErasedEmail } from "../models/user";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityProviderRepository } from "../repositories/kysely-identity-provider-repository";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import { kyselySsoRepository } from "../repositories/kysely-sso-repository";
import { planSsoSignIn } from "../services/sso-sign-in";
import { seedErasedUser } from "../testing/erased-user";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { authenticateToken, createMyToken, exchangePassword } from "./access-tokens";
import {
  createRoot,
  listRoots,
  resetRootPassword,
  resetTwoFactorFromCli,
  twoFactorOfEmail,
} from "./root-account";
import { getCurrentUser, signIn } from "./session";
import {
  adminChangeRole,
  adminDisableImpact,
  adminDisableUser,
  adminEnableUser,
  adminListUsers,
  adminResetPassword,
  adminResetTwoFactor,
} from "./user-admin";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Every path that must refuse an erased account (103, task 1), seeded as erasing leaves it.
let t: TestDb;
let app: AppAuth;
let asRoot: Headers;
const rootPassword = "correct horse battery";
const password = "a brand new passphrase";

const headersFor = async (email: string, pw: string) => {
  const result = await signIn(new Headers(), { email, password: pw, rememberMe: false }, app);
  if (!result.ok) throw new Error(`sign-in failed for ${email}: ${result.error}`);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: rootPassword,
  });
  asRoot = await headersFor("root@example.com", rootPassword);
});
afterEach(() => t.cleanup());

const userRow = (id: string) =>
  t.db.selectFrom("user").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const auditCount = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 200 })).events.length;
/** Everything a refused change must leave as it was. */
const snapshot = async (id: string) => ({
  user: await userRow(id),
  accounts: await t.db.selectFrom("account").selectAll().where("user_id", "=", id).execute(),
  sessions: await t.db.selectFrom("session").selectAll().where("user_id", "=", id).execute(),
  events: await auditCount(),
});

describe("the pseudonym (103)", () => {
  it("is made from the id alone, on the reserved domain, and is recognised when typed", () => {
    expect(erasedName("01ABC")).toBe("deleted-user-01ABC");
    expect(erasedEmail("01ABC")).toBe("deleted-user-01ABC@ronne.invalid");
    expect(isErasedEmail(" Deleted-User-01ABC@Ronne.Invalid ")).toBe(true);
    expect(isErasedEmail("deleted-user-01ABC@example.com")).toBe(false);
    expect(isErasedEmail("someone@ronne.invalid")).toBe(false);
  });

  it("is what the column and the summaries hold after an erasure; nobody else has it", async () => {
    const erased = await seedErasedUser(t);
    expect(await userRow(erased.id)).toMatchObject({
      email: erasedEmail(erased.id),
      name: erasedName(erased.id),
      role: "user",
    });
    expect((await userRow(erased.id)).erased_at).not.toBeNull();
    const root = await t.db
      .selectFrom("user")
      .selectAll()
      .where("role", "=", "root")
      .executeTakeFirstOrThrow();
    expect(root.erased_at).toBeNull();
    const page = await adminListUsers(asRoot, {}, app);
    const rows = Object.fromEntries(page.users.map((u) => [u.id, u]));
    expect(rows[erased.id]?.erasedAt).toBeInstanceOf(Date);
    expect(rows[erased.id]?.disabledAt).toBeInstanceOf(Date);
    expect(rows[root.id]?.erasedAt).toBeNull();
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    expect((await repo.findUser(erased.id))?.erasedAt).toBeInstanceOf(Date);
    expect((await repo.findUserByEmail(erased.email))?.erasedAt).toBeInstanceOf(Date);
    expect(await repo.findActiveUser(erased.id)).toBeNull();
  });
});

describe("root's admin against an erased account (103)", () => {
  it("refuses enable, disable, role, password, two-factor and the impact, each with the same message, and changes nothing", async () => {
    const erased = await seedErasedUser(t);
    const before = await snapshot(erased.id);
    const attempts = [
      () => adminEnableUser(asRoot, erased.id, app),
      () => adminDisableUser(asRoot, erased.id, app),
      () => adminChangeRole(asRoot, erased.id, "root", app),
      () => adminResetPassword(asRoot, erased.id, undefined, app),
      () => adminResetTwoFactor(asRoot, erased.id, app),
      () => adminDisableImpact(asRoot, erased.id, app),
    ];
    for (const attempt of attempts) {
      await expect(attempt()).rejects.toThrow(UserErasedError);
      await expect(attempt()).rejects.toThrow(
        "That account was erased. It can't be changed, signed in to or provisioned again.",
      );
    }
    expect(await snapshot(erased.id)).toEqual(before);
  });

  it("never counts an erased row as a root, whatever its role says (059)", async () => {
    await seedErasedUser(t, { role: "root", disabled: false });
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    expect(await repo.countActiveRoots()).toBe(1);
    // Another real root can step down, since one stays; the erased row isn't what keeps it.
    const second = await createTestUser(app, {
      email: "second@example.com",
      password: rootPassword,
      role: "root",
    });
    expect(await repo.countActiveRoots()).toBe(2);
    await adminChangeRole(asRoot, second, "user", app);
    expect(await repo.countActiveRoots()).toBe(1);
  });
});

describe("signing in to an erased account (103)", () => {
  it("is refused with a password: no password row, and the row refuses even with one", async () => {
    const erased = await seedErasedUser(t);
    const typed = await signIn(
      new Headers(),
      { email: erased.email, password: rootPassword, rememberMe: false },
      app,
    );
    expect(typed).toEqual({ ok: false, error: "invalid_credentials" });
    // A row that still had a real email and a password (no erasure leaves one): the flag refuses.
    const byHand = await createTestUser(app, { email: "gone@example.com", password });
    const signedIn = await headersFor("gone@example.com", password);
    expect(await getCurrentUser(signedIn, app)).toMatchObject({ id: byHand });
    await t.db
      .updateTable("user")
      .set({ erased_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", byHand)
      .execute();
    expect(await getCurrentUser(signedIn, app)).toBeNull();
    const again = await signIn(
      new Headers(),
      { email: "gone@example.com", password, rememberMe: false },
      app,
    );
    expect(again).toEqual({ ok: false, error: "invalid_credentials" });
  });

  it("is refused by a token that survived, by the flag alone", async () => {
    const byHand = await createTestUser(app, { email: "gone@example.com", password });
    const asGone = await headersFor("gone@example.com", password);
    const created = await createMyToken(asGone, { name: "cli" }, app);
    expect((await authenticateToken(created.token, app)).ok).toBe(true);
    await t.db
      .updateTable("user")
      .set({ erased_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", byHand)
      .execute();
    expect(await authenticateToken(created.token, app)).toEqual({
      ok: false,
      failure: "user_disabled",
    });
  });

  it("is refused by the token exchange, as a disabled one is", async () => {
    const byHand = await createTestUser(app, { email: "gone@example.com", password });
    await t.db
      .updateTable("user")
      .set({ erased_at: toDbDate(new Date(), t.dialect) })
      .where("id", "=", byHand)
      .execute();
    const result = await exchangePassword(
      { email: "gone@example.com", password },
      new Headers(),
      app,
    );
    expect(result).toEqual({ ok: false, error: "invalid_credentials" });
    const failed = (await listAuditEvents(t.db, t.dialect, {})).events.filter(
      (e) => e.action === "auth.sign_in_failed",
    );
    expect(failed[0]?.metadata).toMatchObject({ reason: "disabled", via: "cli" });
    const tokens = await t.db
      .selectFrom("access_tokens")
      .select("id")
      .where("user_id", "=", byHand)
      .execute();
    expect(tokens).toEqual([]);
  });

  it("is refused by an identity provider, by a surviving link and by the email", async () => {
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
        domains: JSON.stringify(["example.com"]),
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
    const provider = (await kyselyIdentityProviderRepository(t.db, t.dialect).find("acme"))
      ?.provider;
    if (!provider) throw new Error("no provider");
    const sso = kyselySsoRepository(t.db, t.dialect);
    const erased = await seedErasedUser(t, { disabled: false });
    await sso.linkAccount(erased.id, "acme", "sub-erased", new Date());
    const identity = {
      subject: "sub-erased",
      email: "new@example.com",
      emailVerified: true,
      name: "N",
      groups: null,
    };
    expect(await planSsoSignIn(sso, provider, identity)).toMatchObject({
      action: "refuse",
      reason: "disabled",
      user: { id: erased.id },
    });
    const byEmail = await seedErasedUser(t, { email: "gone@example.com", disabled: false });
    expect(
      await planSsoSignIn(sso, provider, {
        ...identity,
        subject: "sub-other",
        email: "gone@example.com",
      }),
    ).toMatchObject({ action: "refuse", reason: "disabled", user: { id: byEmail.id } });
    // The old email, free again: a sign-in with it makes a new account, as 106 says.
    expect(
      await planSsoSignIn(sso, provider, {
        ...identity,
        subject: "sub-new",
        email: "new@example.com",
      }),
    ).toMatchObject({ action: "create", email: "new@example.com" });
  });
});

describe("the commands given an erased account's pseudonym (103)", () => {
  it("refuse reset-root-password, reset-two-factor and its question with 'that account was erased'", async () => {
    const erased = await seedErasedUser(t);
    const events = await auditCount();
    const message =
      "That account was erased. It can't be changed, signed in to or provisioned again.";
    await expect(resetRootPassword(t.db, t.dialect, password, erased.email)).rejects.toThrow(
      message,
    );
    await expect(resetTwoFactorFromCli(t.db, t.dialect, erased.email)).rejects.toThrow(message);
    await expect(twoFactorOfEmail(t.db, t.dialect, erased.email)).rejects.toThrow(message);
    // A pseudonym nobody has: still that answer, never "invalid email".
    await expect(twoFactorOfEmail(t.db, t.dialect, erasedEmail("01NOBODY"))).rejects.toThrow(
      UserErasedError,
    );
    // A real email on an erased row (no erasure leaves one): the flag answers.
    const byHand = await seedErasedUser(t, { email: "gone@example.com" });
    await expect(resetTwoFactorFromCli(t.db, t.dialect, byHand.email)).rejects.toThrow(
      UserErasedError,
    );
    await expect(twoFactorOfEmail(t.db, t.dialect, byHand.email)).rejects.toThrow(UserErasedError);
    expect(await auditCount()).toBe(events);
  });

  it("never lists an erased row as a root, so reset-root-password can't reach it by any route", async () => {
    const erased = await seedErasedUser(t, { role: "root", disabled: false });
    const roots = await listRoots(t.db, t.dialect);
    expect(roots.map((r) => r.email)).toEqual(["root@example.com"]);
    // One real root: no email needed, and the erased row isn't the one reset.
    expect(await resetRootPassword(t.db, t.dialect, password)).toMatchObject({
      email: "root@example.com",
    });
    expect(await userRow(erased.id)).toMatchObject({ disabled_at: null, role: "root" });
    expect(
      await t.db.selectFrom("account").select("id").where("user_id", "=", erased.id).execute(),
    ).toEqual([]);
    // The only root-role row an erased one: there is no root to reset.
    await t.db
      .updateTable("user")
      .set({ role: "user" })
      .where("role", "=", "root")
      .where("erased_at", "is", null)
      .execute();
    await expect(resetRootPassword(t.db, t.dialect, password)).rejects.toThrow(RootNotFoundError);
    expect(await listRoots(t.db, t.dialect)).toEqual([]);
  });

  it("refuses in the reset-root-password command itself, before any password is asked", async () => {
    // The command opens its own connection from a URL, so SQLite uses a file here.
    const appDir = mkdtempSync(join(tmpdir(), "ronne-erased-"));
    const onServer = Boolean(process.env.TEST_DATABASE_URL);
    const url = onServer ? t.url : `file:${join(appDir, "reset.db")}`;
    let own: { db: TestDb["db"]; dialect: TestDb["dialect"] } | null = null;
    try {
      if (!onServer) {
        own = createDb(url);
        await migrateToLatest(own.db, own.dialect);
        await createRoot(own.db, own.dialect, {
          email: "root@example.com",
          name: "Root",
          password: rootPassword,
        });
      }
      const target = own ?? t;
      const erased = await seedErasedUser(target);
      const { prompts, asked } = scriptedPrompts({});
      await expect(
        runResetRootPassword({
          appDir,
          envPath: join(appDir, ".env"),
          prompts,
          databaseUrl: url,
          rootEmail: erased.email,
        }),
      ).rejects.toThrow(SetupFailedError);
      await expect(
        runResetRootPassword({
          appDir,
          envPath: join(appDir, ".env"),
          prompts,
          databaseUrl: url,
          rootEmail: erased.email,
        }),
      ).rejects.toThrow("That account was erased");
      expect(asked).toEqual([]);
    } finally {
      await own?.db.destroy();
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});
