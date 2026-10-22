import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents, recordAudit } from "../../audit/actions/audit";
import type { AuditMetadata } from "../../audit/models/audit-event";
import {
  CannotModifySelfError,
  EmailTakenError,
  ForbiddenError,
  InvalidPasswordError,
  InvalidRoleError,
  LastRootError,
  UserNotFoundError,
} from "../exceptions/errors";
import { GENERATED_PASSWORD_LENGTH } from "../models/generated-password";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/user-admin";
import { seedErasedUser } from "../testing/erased-user";
import { cookieHeaders, createTestUser, setWorkspaceRole, testAppAuth } from "../testing/test-auth";
import { createRoot } from "./root-account";
import { getCurrentUser, signIn } from "./session";
import {
  adminChangeRole,
  adminCreateUser,
  adminDisableImpact,
  adminDisableUser,
  adminEnableUser,
  adminGetUser,
  adminListUsers,
  adminResetPassword,
} from "./user-admin";

const onServer = Boolean(process.env.TEST_DATABASE_URL);
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
const rootPassword = "correct horse battery";

const headersFor = async (email: string, password: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(`sign-in failed for ${email}: ${result.error}`);
  return cookieHeaders(result.headers.get("set-cookie"));
};

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: rootPassword,
  }));
  asRoot = await headersFor("root@example.com", rootPassword);
});
afterEach(() => t.cleanup());

const events = async (action: string) =>
  (await listAuditEvents(t.db, t.dialect, {})).events.filter((e) => e.action === action);

const canSignIn = async (email: string, password: string) =>
  (await signIn(new Headers(), { email, password, rememberMe: false }, testAppAuth(t))).ok;

const addToken = async (userId: string) => {
  await t.db
    .insertInto("access_tokens")
    .values({
      id: newId(),
      user_id: userId,
      name: "laptop",
      token_hash: newId().padEnd(64, "0"),
      last_used_at: null,
      expires_at: null,
      revoked_at: null,
      created_at: toDbDate(new Date(), t.dialect),
    })
    .execute();
};

const activeTokens = async (userId: string) =>
  (
    await t.db
      .selectFrom("access_tokens")
      .select("id")
      .where("user_id", "=", userId)
      .where("revoked_at", "is", null)
      .execute()
  ).length;

describe("permissions", () => {
  it("refuses every operation to users, moderators and anyone signed out", async () => {
    await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await createTestUser(app, {
      email: "m@example.com",
      password: rootPassword,
      role: "moderator",
    });
    const target = await createTestUser(app, { email: "t@example.com", password: rootPassword });
    const callers = [
      await headersFor("u@example.com", rootPassword),
      await headersFor("m@example.com", rootPassword),
      new Headers(),
    ];
    for (const headers of callers) {
      for (const call of [
        () => adminListUsers(headers, {}, app),
        () => adminCreateUser(headers, { email: "x@example.com", name: "X", role: "user" }, app),
        () => adminChangeRole(headers, target, "moderator", app),
        () => adminDisableUser(headers, target, app),
        () => adminEnableUser(headers, target, app),
        () => adminResetPassword(headers, target, undefined, app),
        () => adminDisableImpact(headers, target, app),
        () => adminGetUser(headers, target, app),
      ]) {
        await expect(call()).rejects.toThrow(ForbiddenError);
      }
    }
    expect(
      await t.db.selectFrom("user").select("id").where("email", "=", "x@example.com").execute(),
    ).toEqual([]);
  });
});

describe("createUser", () => {
  it("with a generated password: shown once, works for sign-in, and audited without it", async () => {
    const created = await adminCreateUser(
      asRoot,
      { email: "  New@Example.com ", name: " New ", role: "user" },
      app,
    );
    expect(created.email).toBe("new@example.com");
    expect(created.password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(await canSignIn("new@example.com", created.password)).toBe(true);

    const [event] = await events("user.created");
    expect(event).toMatchObject({
      actorId: rootId,
      targetId: created.id,
      metadata: { email: "new@example.com", role: "user" },
    });
    expect(JSON.stringify(await t.db.selectFrom("audit_log").selectAll().execute())).not.toContain(
      created.password,
    );
  });

  it("with a typed password, following 003's rules", async () => {
    await expect(
      adminCreateUser(
        asRoot,
        { email: "a@example.com", name: "A", role: "user", password: "short" },
        app,
      ),
    ).rejects.toThrow(InvalidPasswordError);
    const created = await adminCreateUser(
      asRoot,
      { email: "a@example.com", name: "A", role: "user", password: "a typed passphrase" },
      app,
    );
    expect(created.password).toBe("a typed passphrase");
    expect(await canSignIn("a@example.com", "a typed passphrase")).toBe(true);
  });

  it("refuses a duplicate email in any case, and unknown roles, recording nothing", async () => {
    await adminCreateUser(asRoot, { email: "alex@example.com", name: "Alex", role: "user" }, app);
    await expect(
      adminCreateUser(asRoot, { email: "Alex@Example.com", name: "Other", role: "user" }, app),
    ).rejects.toThrow(EmailTakenError);
    await expect(
      adminCreateUser(asRoot, { email: "r3@example.com", name: "R3", role: "admin" }, app),
    ).rejects.toThrow(InvalidRoleError);
    expect(await events("user.created")).toHaveLength(1);
  });

  it("creates another root, who can manage users (059)", async () => {
    const created = await adminCreateUser(
      asRoot,
      { email: "r2@example.com", name: "R2", role: "root" },
      app,
    );
    const [event] = await events("user.created");
    expect(event).toMatchObject({ metadata: { email: "r2@example.com", role: "root" } });
    const asSecond = await headersFor("r2@example.com", created.password);
    expect((await adminListUsers(asSecond, { role: "root" }, app)).users).toHaveLength(2);
  });
});

describe("global membership (091)", () => {
  /** A user's memberships but their own personal workspace's (114), checked on its own. */
  const memberships = (userId: string) =>
    t.db
      .selectFrom("workspace_members")
      .select(["workspace_id", "role"])
      .where("user_id", "=", userId)
      .where("workspace_id", "not in", (eb) =>
        eb.selectFrom("workspaces").select("id").where("owner_id", "=", userId),
      )
      .execute();
  const personal = (userId: string) =>
    t.db
      .selectFrom("workspaces")
      .innerJoin("workspace_members", "workspace_members.workspace_id", "workspaces.id")
      .select([
        "workspaces.name as name",
        "workspaces.visibility as visibility",
        "workspace_members.role as role",
      ])
      .where("workspaces.owner_id", "=", userId)
      .where("workspace_members.user_id", "=", userId)
      .execute();

  it("puts a new user in global, and a new root nowhere", async () => {
    const user = await adminCreateUser(
      asRoot,
      { email: "u@example.com", name: "U", role: "user" },
      app,
    );
    const root = await adminCreateUser(
      asRoot,
      { email: "r2@example.com", name: "R2", role: "root" },
      app,
    );
    expect(await memberships(user.id)).toEqual([
      { workspace_id: GLOBAL_WORKSPACE_ID, role: "user" },
    ]);
    expect(await memberships(root.id)).toEqual([]);
    expect(await memberships(rootId)).toEqual([]);
    // Each has a personal workspace of their own, roots too, as its admin (114).
    expect(await personal(user.id)).toEqual([{ name: "u", visibility: "private", role: "admin" }]);
    expect(await personal(root.id)).toEqual([{ name: "r2", visibility: "private", role: "admin" }]);
    expect(await personal(rootId)).toEqual([
      { name: "root-2", visibility: "private", role: "admin" },
    ]);
  });

  it("lists each user's roles per workspace, moderated first (091)", async () => {
    await createTestUser(app, {
      email: "m@example.com",
      password: rootPassword,
      role: "moderator",
    });
    await createTestUser(app, { email: "u@example.com", password: rootPassword });
    const listed = (await adminListUsers(asRoot, { sort: "email" }, app)).users;
    const roles = (email: string) => listed.find((u) => u.email === email)?.workspaces;
    expect(roles("m@example.com")).toEqual([{ name: "global", role: "moderator" }]);
    // Admins first, then moderators, then users (092).
    const ops = newId();
    const beta = newId();
    for (const [id, name] of [
      [ops, "ops"],
      [beta, "beta"],
    ] as const)
      await t.db
        .insertInto("workspaces")
        .values({
          id,
          name,
          description: name,
          visibility: "public",
          is_global: 0,
          created_by: null,
          created_at: toDbDate(new Date(), t.dialect),
          updated_at: toDbDate(new Date(), t.dialect),
        })
        .execute();
    const mId = listed.find((u) => u.email === "m@example.com")?.id ?? "";
    await setWorkspaceRole(app, mId, "user", beta);
    await setWorkspaceRole(app, mId, "admin", ops);
    const again = (await adminListUsers(asRoot, { sort: "email" }, app)).users;
    expect(again.find((u) => u.id === mId)?.workspaces).toEqual([
      { name: "ops", role: "admin" },
      { name: "global", role: "moderator" },
      { name: "beta", role: "user" },
    ]);
    expect(roles("u@example.com")).toEqual([{ name: "global", role: "user" }]);
    // Root's own personal workspace (114) isn't listed: everyone has one.
    expect(roles("root@example.com")).toEqual([]);
  });

  it("puts a root who stops being root in global, once", async () => {
    const root = await adminCreateUser(
      asRoot,
      { email: "r2@example.com", name: "R2", role: "root" },
      app,
    );
    await adminChangeRole(asRoot, root.id, "user", app);
    await adminChangeRole(asRoot, root.id, "root", app);
    await adminChangeRole(asRoot, root.id, "user", app);
    expect(await memberships(root.id)).toEqual([
      { workspace_id: GLOBAL_WORKSPACE_ID, role: "user" },
    ]);
  });
});

describe("changeRole", () => {
  it("switches between user and root, audited; the same role changes nothing", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await adminChangeRole(asRoot, id, "root", app);
    await adminChangeRole(asRoot, id, "root", app);
    await adminChangeRole(asRoot, id, "user", app);
    expect((await events("user.role_changed")).map((e) => e.metadata)).toEqual([
      { from: "root", to: "user" },
      { from: "user", to: "root" },
    ]);
  });

  it("refuses moderator: it's a role in a workspace now (091)", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await expect(adminChangeRole(asRoot, id, "moderator", app)).rejects.toThrow(InvalidRoleError);
    await expect(
      adminCreateUser(asRoot, { email: "m@example.com", name: "M", role: "moderator" }, app),
    ).rejects.toThrow(InvalidRoleError);
    expect(await events("user.role_changed")).toEqual([]);
  });

  it("promotes to root and demotes another root, audited (059)", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await adminChangeRole(asRoot, id, "root", app);
    const asSecond = await headersFor("u@example.com", rootPassword);
    expect((await adminListUsers(asSecond, {}, app)).users.length).toBeGreaterThan(0);
    await adminChangeRole(asSecond, rootId, "user", app);
    await expect(adminListUsers(asRoot, {}, app)).rejects.toThrow(ForbiddenError);
    expect((await events("user.role_changed")).map((e) => e.metadata)).toEqual([
      { from: "root", to: "user" },
      { from: "user", to: "root" },
    ]);
  });

  it("refuses your own row, unknown roles and unknown users", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await expect(adminChangeRole(asRoot, rootId, "user", app)).rejects.toThrow(
      CannotModifySelfError,
    );
    await expect(adminChangeRole(asRoot, id, "admin", app)).rejects.toThrow(InvalidRoleError);
    await expect(adminChangeRole(asRoot, newId(), "user", app)).rejects.toThrow(UserNotFoundError);
    expect(await events("user.role_changed")).toEqual([]);
  });
});

describe("disable and enable", () => {
  it("disabling ends sessions and revokes tokens at once, audited with the counts", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    const theirs = await headersFor("u@example.com", rootPassword);
    await headersFor("u@example.com", rootPassword);
    await addToken(id);
    expect(await adminDisableImpact(asRoot, id, app)).toEqual({ sessions: 2, tokens: 1 });

    await adminDisableUser(asRoot, id, app);
    expect(await getCurrentUser(theirs, app)).toBeNull();
    expect(await activeTokens(id)).toBe(0);
    expect(await canSignIn("u@example.com", rootPassword)).toBe(false);
    const [event] = await events("user.disabled");
    expect(event).toMatchObject({ targetId: id, metadata: { sessionsEnded: 2, tokensRevoked: 1 } });

    // Disabling again does nothing more.
    await adminDisableUser(asRoot, id, app);
    expect(await events("user.disabled")).toHaveLength(1);
  });

  it("enabling restores sign-in, and revoked tokens stay revoked", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await addToken(id);
    await adminDisableUser(asRoot, id, app);
    await adminEnableUser(asRoot, id, app);
    expect(await canSignIn("u@example.com", rootPassword)).toBe(true);
    expect(await activeTokens(id)).toBe(0);
    expect(await events("user.enabled")).toHaveLength(1);
  });

  it("a failed audit write rolls the whole disable back", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await headersFor("u@example.com", rootPassword);
    await addToken(id);
    const real = kyselyIdentityRepository(t.db, t.dialect);
    const failingAudit = {
      ...real,
      transaction: <T>(work: (repo: typeof real) => Promise<T>) =>
        real.transaction((repo) =>
          work({
            ...repo,
            recordAudit: async () => {
              throw new Error("audit write failed");
            },
          }),
        ),
    };
    const root = await getCurrentUser(asRoot, app);
    await expect(
      service.disableUser(
        { repo: failingAudit, hasher: { hash: async () => "", verify: async () => false } },
        { user: root, ip: null },
        id,
      ),
    ).rejects.toThrow("audit write failed");

    const user = await t.db
      .selectFrom("user")
      .select("disabled_at")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(user.disabled_at).toBeNull();
    expect(await activeTokens(id)).toBe(1);
    const sessions = await t.db
      .selectFrom("session")
      .select("id")
      .where("user_id", "=", id)
      .execute();
    expect(sessions).toHaveLength(1);
  });

  it("refuses your own row", async () => {
    await expect(adminDisableUser(asRoot, rootId, app)).rejects.toThrow(CannotModifySelfError);
    await expect(adminEnableUser(asRoot, rootId, app)).rejects.toThrow(CannotModifySelfError);
    await expect(adminDisableImpact(asRoot, rootId, app)).rejects.toThrow(CannotModifySelfError);
    expect(await getCurrentUser(asRoot, app)).not.toBeNull();
  });

  it("disables and enables another root (059)", async () => {
    const id = await createTestUser(app, {
      email: "r2@example.com",
      password: rootPassword,
      role: "root",
    });
    await adminDisableUser(asRoot, id, app);
    expect(await canSignIn("r2@example.com", rootPassword)).toBe(false);
    await adminEnableUser(asRoot, id, app);
    expect(await canSignIn("r2@example.com", rootPassword)).toBe(true);
  });
});

describe("roots acting at once (059)", () => {
  const noHasher = { hash: async () => "", verify: async () => false };
  const activeRoots = async () =>
    (
      await t.db
        .selectFrom("user")
        .select(["email", "role"])
        .where("role", "=", "root")
        .where("disabled_at", "is", null)
        .execute()
    ).map((u) => u.email);

  it("two roots demoting each other: one wins, the other is refused, one root remains", async () => {
    await createTestUser(app, { email: "r2@example.com", password: rootPassword, role: "root" });
    const second = await headersFor("r2@example.com", rootPassword);
    const secondId = (await getCurrentUser(second, app))?.id ?? "";
    const results = await Promise.allSettled([
      adminChangeRole(asRoot, secondId, "user", app),
      adminChangeRole(second, rootId, "user", app),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [refused] = results.filter((r) => r.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toBeInstanceOf(ForbiddenError);
    expect(await activeRoots()).toHaveLength(1);
    expect(await events("user.role_changed")).toHaveLength(1);
  });

  it("two roots disabling each other: the same", async () => {
    await createTestUser(app, { email: "r2@example.com", password: rootPassword, role: "root" });
    const second = await headersFor("r2@example.com", rootPassword);
    const secondId = (await getCurrentUser(second, app))?.id ?? "";
    const results = await Promise.allSettled([
      adminDisableUser(asRoot, secondId, app),
      adminDisableUser(second, rootId, app),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await activeRoots()).toHaveLength(1);
  });

  it("a root demoted after the request began can't finish the change", async () => {
    const root = await getCurrentUser(asRoot, app);
    const target = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await createTestUser(app, { email: "r2@example.com", password: rootPassword, role: "root" });
    await t.db.updateTable("user").set({ role: "user" }).where("id", "=", rootId).execute();
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    await expect(
      service.changeRole({ repo, hasher: noHasher }, { user: root, ip: null }, target, "root"),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      service.createUser(
        { repo, hasher: argon2PasswordHasher },
        { user: root, ip: null },
        { email: "x@example.com", name: "X", role: "user" },
      ),
    ).rejects.toThrow(ForbiddenError);
    expect(await events("user.role_changed")).toEqual([]);
  });

  it("never leaves the instance without an active root", async () => {
    // Reachable only through a race or bad data: the repository reports no root left.
    const other = await createTestUser(app, {
      email: "r2@example.com",
      password: rootPassword,
      role: "root",
    });
    const real = kyselyIdentityRepository(t.db, t.dialect);
    const noRootsLeft = {
      ...real,
      transaction: <T>(work: (repo: typeof real) => Promise<T>) =>
        real.transaction((repo) => work({ ...repo, countActiveRoots: async () => 0 })),
    };
    const actor = { user: await getCurrentUser(asRoot, app), ip: null };
    const deps = { repo: noRootsLeft, hasher: noHasher };
    await expect(service.changeRole(deps, actor, other, "user")).rejects.toThrow(LastRootError);
    await expect(service.disableUser(deps, actor, other)).rejects.toThrow(LastRootError);
    expect(await activeRoots()).toHaveLength(2);
    expect(await events("user.role_changed")).toEqual([]);
    expect(await events("user.disabled")).toEqual([]);
  });
});

describe("resetPassword", () => {
  it("shows a new password once, ends sessions, revokes tokens, and the old one stops working", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    const theirs = await headersFor("u@example.com", rootPassword);
    await addToken(id);

    const reset = await adminResetPassword(asRoot, id, undefined, app);
    expect(reset.email).toBe("u@example.com");
    expect(reset.password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(await getCurrentUser(theirs, app)).toBeNull();
    expect(await activeTokens(id)).toBe(0);
    expect(await canSignIn("u@example.com", rootPassword)).toBe(false);
    expect(await canSignIn("u@example.com", reset.password)).toBe(true);

    const [event] = await events("user.password_reset");
    expect(event).toMatchObject({
      actorId: rootId,
      targetId: id,
      metadata: { via: "web", sessionsEnded: 1, tokensRevoked: 1 },
    });
  });

  it("gives a password to an account that has none, made by a provider's sign-in or SCIM (108)", async () => {
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    const id = await repo.createUserWithoutPassword(
      { email: "sso@example.com", name: "SSO only", role: "user" },
      new Date(),
    );
    expect(await canSignIn("sso@example.com", "a typed passphrase")).toBe(false);
    await adminResetPassword(asRoot, id, "a typed passphrase", app);
    expect(await canSignIn("sso@example.com", "a typed passphrase")).toBe(true);
    const rows = await t.db
      .selectFrom("account")
      .select("id")
      .where("user_id", "=", id)
      .where("provider_id", "=", "credential")
      .execute();
    expect(rows).toHaveLength(1);
  });

  // Two at once add one password row between them: the user's row is locked first. Each
  // transaction holds on until the other has started, so only the servers run it (SQLite has one
  // connection, and the second would wait for the first forever).
  it.skipIf(!onServer)("two password resets at once add one password row", async () => {
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    let started = 0;
    const both = new Promise<void>((resolve) => {
      const check = () => (started === 2 ? resolve() : setTimeout(check, 5));
      check();
    });
    const second = await repo.createUserWithoutPassword(
      { email: "sso2@example.com", name: "SSO two", role: "user" },
      new Date(),
    );
    const race = (hash: string) =>
      repo.transaction(async (trx) => {
        await trx.findUser(second);
        started += 1;
        await both;
        await trx.setPassword(second, hash, new Date());
      });
    // Both succeed: the second waits for the first, then updates the row it added.
    const settled = await Promise.allSettled([race("hash-one"), race("hash-two")]);
    expect(settled.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    const secondRows = await t.db
      .selectFrom("account")
      .select("id")
      .where("user_id", "=", second)
      .where("provider_id", "=", "credential")
      .execute();
    expect(secondRows).toHaveLength(1);
  });

  it("takes a typed password, resets another root, and refuses your own", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await adminResetPassword(asRoot, id, "a typed passphrase", app);
    expect(await canSignIn("u@example.com", "a typed passphrase")).toBe(true);
    const other = await createTestUser(app, {
      email: "r2@example.com",
      password: rootPassword,
      role: "root",
    });
    await adminResetPassword(asRoot, other, "another passphrase", app);
    expect(await canSignIn("r2@example.com", "another passphrase")).toBe(true);
    await expect(adminResetPassword(asRoot, rootId, undefined, app)).rejects.toThrow(
      CannotModifySelfError,
    );
    expect(await canSignIn("root@example.com", rootPassword)).toBe(true);
  });
});

describe("asking for a new password at first sign-in (128)", () => {
  const flagged = async (id: string) =>
    (await kyselyIdentityRepository(t.db, t.dialect).findUser(id))?.passwordChangeRequiredAt;

  it("flags a new account by default, and says so in the audit event", async () => {
    const created = await adminCreateUser(
      asRoot,
      { email: "new@example.com", name: "New", role: "user" },
      app,
    );
    expect(await flagged(created.id)).toBeInstanceOf(Date);
    const [event] = await events("user.created");
    expect(event?.metadata).toMatchObject({ changeRequired: true });
  });

  it("leaves a new account alone when root unchecks it, and audits that", async () => {
    const created = await adminCreateUser(
      asRoot,
      { email: "shared@example.com", name: "Shared", role: "user", requireChange: false },
      app,
    );
    expect(await flagged(created.id)).toBeNull();
    const [event] = await events("user.created");
    expect(event?.metadata).toMatchObject({ changeRequired: false });
  });

  it("flags a reset by default, and an unchecked reset clears an earlier request", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    expect(await flagged(id)).toBeNull();
    await adminResetPassword(asRoot, id, undefined, app);
    expect(await flagged(id)).toBeInstanceOf(Date);
    await adminResetPassword(asRoot, id, undefined, app, false);
    expect(await flagged(id)).toBeNull();
    const resets = await events("user.password_reset");
    expect(resets.map((e) => e.metadata?.changeRequired).sort()).toEqual([false, true]);
  });

  it("never flags root's own row, an account made by a provider's sign-in or by SCIM, or an account made through Better Auth", async () => {
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    await expect(adminResetPassword(asRoot, rootId, undefined, app)).rejects.toThrow(
      CannotModifySelfError,
    );
    expect(await flagged(rootId)).toBeNull();
    const sso = await repo.createUserWithoutPassword(
      { email: "sso@example.com", name: "SSO", role: "user" },
      new Date(),
    );
    expect(await flagged(sso)).toBeNull();
    const plain = await createTestUser(app, { email: "p@example.com", password: rootPassword });
    expect(await flagged(plain)).toBeNull();
  });

  const failingAuditDeps = () => {
    const real = kyselyIdentityRepository(t.db, t.dialect);
    const repo = {
      ...real,
      transaction: <T>(work: (repo: typeof real) => Promise<T>) =>
        real.transaction((inner) =>
          work({
            ...inner,
            recordAudit: async () => {
              throw new Error("audit write failed");
            },
          }),
        ),
    };
    return { repo, hasher: { hash: async () => "hash", verify: async () => false } };
  };

  it("a failed audit write leaves no new account behind, and a reset leaves the flag as it was", async () => {
    const root = await getCurrentUser(asRoot, app);
    const actor = { user: root, ip: null };
    await expect(
      service.createUser(failingAuditDeps(), actor, {
        email: "gone@example.com",
        name: "Gone",
        role: "user",
        password: "a typed passphrase",
      }),
    ).rejects.toThrow("audit write failed");
    expect(
      await kyselyIdentityRepository(t.db, t.dialect).findUserByEmail("gone@example.com"),
    ).toBeNull();

    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await expect(
      service.resetPassword(failingAuditDeps(), actor, id, "a typed passphrase"),
    ).rejects.toThrow("audit write failed");
    expect(await flagged(id)).toBeNull();
  });

  it("asks by default when the service is called without the choice", async () => {
    const root = await getCurrentUser(asRoot, app);
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    const deps = { repo: kyselyIdentityRepository(t.db, t.dialect), hasher: argon2PasswordHasher };
    await service.resetPassword(deps, { user: root, ip: null }, id);
    expect(await flagged(id)).toBeInstanceOf(Date);
  });

  it("keeps the flag when the account is disabled and enabled again", async () => {
    const created = await adminCreateUser(
      asRoot,
      { email: "new@example.com", name: "New", role: "user" },
      app,
    );
    await adminDisableUser(asRoot, created.id, app);
    expect(await flagged(created.id)).toBeInstanceOf(Date);
    await adminEnableUser(asRoot, created.id, app);
    expect(await flagged(created.id)).toBeInstanceOf(Date);
  });
});

describe("listUsers sorting (061)", () => {
  it("sorts by email, name and created, both ways, with ties broken by id across pages", async () => {
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    // More same-named users than a page holds.
    for (let i = 0; i < 30; i++)
      await repo.createUserWithPassword(
        {
          email: `same${String(i).padStart(2, "0")}@example.com`,
          name: "Same",
          role: "user",
          passwordHash: "x",
        },
        new Date(),
      );
    await repo.createUserWithPassword(
      { email: "aaa@example.com", name: "Zed", role: "user", passwordHash: "x" },
      new Date(),
    );
    const all = async (query: Parameters<typeof adminListUsers>[1]) => {
      const seen: string[] = [];
      let page = await adminListUsers(asRoot, { ...query, size: 25 }, app);
      seen.push(...page.users.map((u) => u.email));
      while (page.next) {
        page = await adminListUsers(asRoot, { ...query, size: 25, cursor: page.next }, app);
        seen.push(...page.users.map((u) => u.email));
      }
      return seen;
    };
    const byEmail = await all({ sort: "email" });
    expect(byEmail).toHaveLength(32);
    expect(byEmail[0]).toBe("aaa@example.com");
    expect(byEmail).toEqual([...byEmail].sort());
    expect(await all({ sort: "email", dir: "desc" })).toEqual([...byEmail].reverse());

    const byName = await all({ sort: "name" });
    expect(new Set(byName).size).toBe(32);
    expect(byName.at(0)).toBe("root@example.com"); // "Root" < "Same" < "Zed"
    expect(byName.at(-1)).toBe("aaa@example.com");

    const newest = await all({});
    expect(newest[0]).toBe("aaa@example.com");
    expect(newest.at(-1)).toBe("root@example.com");
  });
});

describe("listUsers", () => {
  it("searches email and name in any case, filters by role and status, and pages", async () => {
    const repo = kyselyIdentityRepository(t.db, t.dialect);
    for (let i = 0; i < 52; i++) {
      await repo.createUserWithPassword(
        {
          email: `user${i}@example.com`,
          name: i === 7 ? "Grace Hopper" : `User ${i}`,
          role: "user",
          passwordHash: "x",
        },
        new Date(),
      );
    }
    const mod = await createTestUser(app, {
      email: "mod@example.com",
      password: rootPassword,
      role: "moderator",
    });
    await adminDisableUser(asRoot, mod, app);

    const first = await adminListUsers(asRoot, {}, app);
    expect(first.users).toHaveLength(50);
    expect(first.users[0]?.email).toBe("mod@example.com");
    // 52 users, the moderator and root: 54 in all.
    expect(first.total).toEqual({ count: 54, capped: false });
    expect(first.previous).toBeNull();
    const second = await adminListUsers(asRoot, { cursor: first.next ?? "" }, app);
    expect(second.users).toHaveLength(4);
    expect(second.next).toBeNull();
    const back = await adminListUsers(asRoot, { cursor: second.previous ?? "" }, app);
    expect(back.users.map((u) => u.id)).toEqual(first.users.map((u) => u.id));

    const emails = async (query: Parameters<typeof adminListUsers>[1]) =>
      (await adminListUsers(asRoot, query, app)).users.map((u) => u.email);
    expect(await emails({ search: "GRACE" })).toEqual(["user7@example.com"]);
    expect(await emails({ search: "  USER51@ " })).toEqual(["user51@example.com"]);
    expect(await emails({ status: "disabled" })).toEqual(["mod@example.com"]);
    expect(await emails({ role: "root" })).toEqual(["root@example.com"]);
    // Wildcards in the search are matched literally.
    expect(await emails({ search: "%" })).toEqual([]);
  });
});

describe("a user's page and last sign-in (123)", () => {
  /** A web sign-in on record, as every kind writes it (password, provider, second step). */
  const signedIn = (userId: string, at: string, metadata: AuditMetadata = {}) =>
    recordAudit(
      t.db,
      t.dialect,
      {
        actorId: userId,
        action: "auth.signed_in",
        target: { type: "session", id: newId() },
        metadata,
      },
      new Date(at),
    );

  it("gives root the account, its roles, two-factor and what signing out would end", async () => {
    const id = await createTestUser(app, {
      email: "m@example.com",
      name: "Mo",
      password: rootPassword,
      role: "moderator",
    });
    await addToken(id);
    await addToken(id);
    await headersFor("m@example.com", rootPassword);
    const { user, sessions, tokens } = await adminGetUser(asRoot, id, app);
    expect(user).toMatchObject({
      id,
      email: "m@example.com",
      name: "Mo",
      role: "user",
      disabledAt: null,
      erasedAt: null,
      twoFactor: false,
      workspaces: [{ name: "global", role: "moderator" }],
    });
    expect(sessions).toBe(1);
    expect(tokens).toBe(2);
  });

  it("shows root's own account and a disabled one, which the list shows too", async () => {
    expect((await adminGetUser(asRoot, rootId, app)).user.role).toBe("root");
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await adminDisableUser(asRoot, id, app);
    expect((await adminGetUser(asRoot, id, app)).user.disabledAt).toBeInstanceOf(Date);
  });

  it("refuses an unknown id", async () => {
    await expect(adminGetUser(asRoot, newId(), app)).rejects.toThrow(UserNotFoundError);
  });

  it("shows an erased account as the pseudonym, with no time and nothing to end", async () => {
    const erased = await seedErasedUser(t);
    await signedIn(erased.id, "2026-10-01T10:00:00Z");
    const { user, sessions, tokens } = await adminGetUser(asRoot, erased.id, app);
    expect(user).toMatchObject({ email: erased.email, lastSignInAt: null });
    expect(user.erasedAt).toBeInstanceOf(Date);
    expect([sessions, tokens]).toEqual([0, 0]);
    const listed = (await adminListUsers(asRoot, {}, app)).users.find((u) => u.id === erased.id);
    expect(listed?.lastSignInAt).toBeNull();
  });

  it("gives the time of the latest web sign-in, whichever way the person signed in", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    expect((await adminGetUser(asRoot, id, app)).user.lastSignInAt).toBeNull();
    await signedIn(id, "2026-10-01T10:00:00Z");
    await signedIn(id, "2026-10-03T08:30:00Z", { twoFactor: "totp" });
    await signedIn(id, "2026-10-02T09:00:00Z");
    expect((await adminGetUser(asRoot, id, app)).user.lastSignInAt).toEqual(
      new Date("2026-10-03T08:30:00Z"),
    );
  });

  it("counts a password sign-in and not other events, or other people's", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    const other = await createTestUser(app, { email: "o@example.com", password: rootPassword });
    expect(await canSignIn("u@example.com", rootPassword)).toBe(true);
    const after = await adminGetUser(asRoot, id, app);
    expect(after.user.lastSignInAt).toBeInstanceOf(Date);
    expect(Date.now() - (after.user.lastSignInAt?.getTime() ?? 0)).toBeLessThan(60_000);
    // A token's use, a failed sign-in and a disable are not a person signing in.
    await recordAudit(
      t.db,
      t.dialect,
      {
        actorId: other,
        action: "user.disabled",
        target: { type: "user", id: other },
        metadata: {},
      },
      new Date("2026-10-05T10:00:00Z"),
    );
    expect((await adminGetUser(asRoot, other, app)).user.lastSignInAt).toBeNull();
  });

  it("fills every row of the list from one query, and leaves never-signed-in ones null", async () => {
    const a = await createTestUser(app, { email: "a@example.com", password: rootPassword });
    const b = await createTestUser(app, { email: "b@example.com", password: rootPassword });
    await signedIn(a, "2026-10-04T10:00:00Z");
    const listed = (await adminListUsers(asRoot, { sort: "email" }, app)).users;
    const by = Object.fromEntries(listed.map((u) => [u.id, u.lastSignInAt ?? null]));
    expect(by[a]).toEqual(new Date("2026-10-04T10:00:00Z"));
    expect(by[b]).toBeNull();
    // Root signed in to take the headers.
    expect(by[rootId]).toBeInstanceOf(Date);
  });

  it("keeps the time through the retention purge, which clears addresses and keeps events (102)", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await signedIn(id, "2020-01-01T10:00:00Z");
    await t.db.updateTable("audit_log").set({ ip_address: null }).execute();
    expect((await adminGetUser(asRoot, id, app)).user.lastSignInAt).toEqual(
      new Date("2020-01-01T10:00:00Z"),
    );
  });
});
