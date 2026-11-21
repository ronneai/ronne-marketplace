import { toDbDate } from "../../../db/dates";
import { GLOBAL_WORKSPACE_ID } from "../../../db/migrations/0019_workspaces";
import type { TestDb } from "../../../db/testing/test-db";
import { createDatabaseRateLimitStore } from "../../../rate-limit/database-store";
import { createMemoryRateLimitStore, memoryRateLimiter } from "../../../rate-limit/memory-store";
import {
  createRateLimiter,
  type RateLimiter,
  type RateLimitStore,
} from "../../../rate-limit/rate-limiter";
import { BACKUP_CODES_LIMIT, LOGIN_LIMIT } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { createAuth } from "../repositories/better-auth";

export const TEST_BASE_URL = "http://localhost:3000";

/** The AUTH_SECRET test apps sign with, unless a test passes another. */
export const TEST_SECRET = "test-secret-test-secret-test-secret-00";

/** The database store (109) on a test database, as the server has it on its own. */
export const testRateLimitStore = (t: TestDb, authSecret = TEST_SECRET): RateLimitStore =>
  createDatabaseRateLimitStore(() => ({ db: t.db, dialect: t.dialect, authSecret }));

/**
 * Sign-in's limiter counted in the test's database, as on the server (109): the real 5 a minute
 * unless `max` says otherwise. Two made on one database share their counts, as replicas do.
 */
export const testLoginLimiter = (t: TestDb, options: { max?: number } = {}): RateLimiter =>
  createRateLimiter({ store: testRateLimitStore(t), ...LOGIN_LIMIT, ...options });

/** Any limit counted in the test's database (109), with another `max` when given. */
export const testLimiter = (
  t: TestDb,
  limit: { name: string; max: number; windowMs: number },
  max: number = limit.max,
): RateLimiter => createRateLimiter({ store: testRateLimitStore(t), ...limit, max });

/** The gap between new backup codes counted in the test's database (109). */
export const testBackupCodesLimiter = (t: TestDb): RateLimiter =>
  createRateLimiter({ store: testRateLimitStore(t), ...BACKUP_CODES_LIMIT });

/** An AppAuth on a test database, like the one getAppAuth() builds for the server. */
export const testAppAuth = (
  t: TestDb,
  options: {
    trustProxy?: boolean;
    /** Sign-in's limiter; by default one of its own in memory, so tests don't share counts. */
    limiter?: RateLimiter;
    /** The backup codes' gap; in memory by default too. */
    backupCodesLimiter?: RateLimiter;
    /** Where the other limits count (SSO, device codes, SCIM); memory by default. */
    rateLimits?: RateLimitStore;
    baseURL?: string;
    /** Another AUTH_SECRET, as after `rotate-secret` and a restart (098). */
    secret?: string;
  } = {},
): AppAuth => {
  const trustProxy = options.trustProxy ?? false;
  return {
    auth: createAuth({
      db: t.db,
      dialect: t.dialect,
      secret: options.secret ?? TEST_SECRET,
      baseURL: options.baseURL ?? TEST_BASE_URL,
      trustProxy,
      // A query Better Auth starts and nobody waits for: it could still hold a connection when the
      // test's pool closes, and the cleanup then waits for ever (a PostgreSQL CI flake).
      validateSchema: false,
    }),
    db: t.db,
    dialect: t.dialect,
    trustProxy,
    limiter: options.limiter ?? memoryRateLimiter(LOGIN_LIMIT),
    backupCodesLimiter: options.backupCodesLimiter ?? memoryRateLimiter(BACKUP_CODES_LIMIT),
    rateLimits: options.rateLimits ?? createMemoryRateLimitStore(),
  };
};

/**
 * Creates a user with a password, the way root will in 008. Returns the user id. `moderator`
 * means a moderator in `global`, as every moderator was before workspaces (091).
 */
export const createTestUser = async (
  app: AppAuth,
  user: { email: string; password: string; name?: string; role?: "root" | "moderator" | "user" },
): Promise<string> => {
  const ctx = await app.auth.$context;
  const created = await ctx.internalAdapter.createUser(
    { email: user.email, name: user.name ?? "Someone", emailVerified: false },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: created.id,
    providerId: "credential",
    accountId: created.id,
    password: await ctx.password.hash(user.password),
  });
  if (user.role !== "root") {
    const now = toDbDate(new Date(), app.dialect);
    await app.db
      .insertInto("workspace_members")
      .values({
        workspace_id: GLOBAL_WORKSPACE_ID,
        user_id: created.id,
        role: user.role === "moderator" ? "moderator" : "user",
        added_by: null,
        created_at: now,
        updated_at: now,
      })
      .execute();
  }
  if (user.role === "root") {
    await app.db.updateTable("user").set({ role: "root" }).where("id", "=", created.id).execute();
  }
  return created.id;
};

/** The request headers a browser would send back after this sign-in response. */
export const cookieHeaders = (setCookie: string | null): Headers => {
  const cookies = (setCookie ?? "")
    .split(/,(?=\s*[\w.-]+=)/)
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean);
  return new Headers({ cookie: cookies.join("; ") });
};

/** Gives a user a role in a workspace, or changes it, as 092's member admin will (091). */
export const setWorkspaceRole = async (
  app: AppAuth,
  userId: string,
  role: "admin" | "moderator" | "user",
  workspaceId: string = GLOBAL_WORKSPACE_ID,
): Promise<void> => {
  const now = toDbDate(new Date(), app.dialect);
  const updated = await app.db
    .updateTable("workspace_members")
    .set({ role, updated_at: now })
    .where("workspace_id", "=", workspaceId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (Number(updated.numUpdatedRows) > 0) return;
  await app.db
    .insertInto("workspace_members")
    .values({
      workspace_id: workspaceId,
      user_id: userId,
      role,
      added_by: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
};
