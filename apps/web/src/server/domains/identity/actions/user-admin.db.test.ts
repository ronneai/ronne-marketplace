import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import {
  CannotModifySelfError,
  EmailTakenError,
  ForbiddenError,
  InvalidPasswordError,
  InvalidRoleError,
  UserNotFoundError,
} from "../exceptions/errors";
import { GENERATED_PASSWORD_LENGTH } from "../models/generated-password";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/user-admin";
import { cookieHeaders, createTestUser, testAppAuth } from "../testing/test-auth";
import { createRoot } from "./root-account";
import { getCurrentUser, signIn } from "./session";
import {
  adminChangeRole,
  adminCreateUser,
  adminDisableImpact,
  adminDisableUser,
  adminEnableUser,
  adminListUsers,
  adminResetPassword,
} from "./user-admin";

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
      { email: "  New@Example.com ", name: " New ", role: "moderator" },
      app,
    );
    expect(created.email).toBe("new@example.com");
    expect(created.password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(await canSignIn("new@example.com", created.password)).toBe(true);

    const [event] = await events("user.created");
    expect(event).toMatchObject({
      actorId: rootId,
      targetId: created.id,
      metadata: { email: "new@example.com", role: "moderator" },
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

describe("changeRole", () => {
  it("switches between user and moderator, audited; the same role changes nothing", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await adminChangeRole(asRoot, id, "moderator", app);
    await adminChangeRole(asRoot, id, "moderator", app);
    await adminChangeRole(asRoot, id, "user", app);
    expect((await events("user.role_changed")).map((e) => e.metadata)).toEqual([
      { from: "moderator", to: "user" },
      { from: "user", to: "moderator" },
    ]);
  });

  it("promotes to root and demotes another root, audited (059)", async () => {
    const id = await createTestUser(app, { email: "u@example.com", password: rootPassword });
    await adminChangeRole(asRoot, id, "root", app);
    const asSecond = await headersFor("u@example.com", rootPassword);
    expect((await adminListUsers(asSecond, {}, app)).users.length).toBeGreaterThan(0);
    await adminChangeRole(asSecond, rootId, "moderator", app);
    await expect(adminListUsers(asRoot, {}, app)).rejects.toThrow(ForbiddenError);
    expect((await events("user.role_changed")).map((e) => e.metadata)).toEqual([
      { from: "root", to: "moderator" },
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
    const second = await adminListUsers(asRoot, { cursor: first.nextCursor ?? "" }, app);
    // 52 users, the moderator and root: 54 in all.
    expect(second.users).toHaveLength(4);
    expect(second.nextCursor).toBeNull();

    const emails = async (query: Parameters<typeof adminListUsers>[1]) =>
      (await adminListUsers(asRoot, query, app)).users.map((u) => u.email);
    expect(await emails({ search: "GRACE" })).toEqual(["user7@example.com"]);
    expect(await emails({ search: "  USER51@ " })).toEqual(["user51@example.com"]);
    expect(await emails({ role: "moderator" })).toEqual(["mod@example.com"]);
    expect(await emails({ status: "disabled" })).toEqual(["mod@example.com"]);
    expect(await emails({ role: "root" })).toEqual(["root@example.com"]);
    // Wildcards in the search are matched literally.
    expect(await emails({ search: "%" })).toEqual([]);
  });
});
