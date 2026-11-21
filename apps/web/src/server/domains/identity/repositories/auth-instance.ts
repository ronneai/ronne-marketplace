import { isConfigured, loadConfig, secretsConflict } from "../../../config";
import type { Db } from "../../../db/create-db";
import { getAppDb } from "../../../db/instance";
import type { DatabaseDialect } from "../../../db/url";
import { createDatabaseRateLimitStore } from "../../../rate-limit/database-store";
import {
  createRateLimiter,
  type RateLimiter,
  type RateLimitStore,
} from "../../../rate-limit/rate-limiter";
import { NotConfiguredError } from "../exceptions/errors";
import { BACKUP_CODES_LIMIT, LOGIN_LIMIT } from "../models/login-rate-limiter";
import { type Auth, createAuth } from "./better-auth";

export type AppAuth = {
  auth: Auth;
  db: Db;
  dialect: DatabaseDialect;
  trustProxy: boolean;
  /** Sign-in's limit (006), counted in the database (109). */
  limiter: RateLimiter;
  /** The gap between new backup codes (105), counted in the database (109). */
  backupCodesLimiter: RateLimiter;
  /** Where every other limit of the instance counts: its database (109). */
  rateLimits: RateLimitStore;
};

// Kept on globalThis, like the database pools, so development hot reloads reuse them. The limits
// need nothing kept: their counts are in the database (109).
const shared = globalThis as typeof globalThis & {
  __ronneAuth?: Map<string, Auth>;
  __ronneAuthFactory?: typeof createAuth;
};

/**
 * Drops what a hot reload left behind from older code (105): Better Auth instances made by an
 * earlier `createAuth` (they'd lack a plugin added since). Unchanged code keeps them, and
 * production loads each module once.
 */
export const dropStale = (): void => {
  if (shared.__ronneAuthFactory !== createAuth) {
    shared.__ronneAuth = new Map();
    shared.__ronneAuthFactory = createAuth;
  }
};

/** The running server's Better Auth instance and its limits, for the current settings. */
export const getAppAuth = (): AppAuth => {
  const config = loadConfig();
  if (!isConfigured(config)) throw new NotConfiguredError();
  // Started some way that skipped the start's check (105): never sign with another secret.
  const conflict = secretsConflict();
  if (conflict) throw new Error(conflict);
  const baseURL = config.publicUrl ?? "http://localhost:3000";

  dropStale();
  shared.__ronneAuth ??= new Map();
  const key = JSON.stringify([config.databaseUrl, config.authSecret, baseURL, config.trustProxy]);
  const { db, dialect } = getAppDb(config.databaseUrl);
  let auth = shared.__ronneAuth.get(key);
  if (!auth) {
    auth = createAuth({
      db,
      dialect,
      secret: config.authSecret,
      baseURL,
      trustProxy: config.trustProxy,
    });
    shared.__ronneAuth.set(key, auth);
  }
  const authSecret = config.authSecret;
  const store = createDatabaseRateLimitStore(() => ({ db, dialect, authSecret }));
  return {
    auth,
    db,
    dialect,
    trustProxy: config.trustProxy,
    limiter: createRateLimiter({ store, ...LOGIN_LIMIT }),
    backupCodesLimiter: createRateLimiter({ store, ...BACKUP_CODES_LIMIT }),
    rateLimits: store,
  };
};

/** The same, or null before setup: then there's no one to sign in, and no database to ask. */
export const getAppAuthIfConfigured = (): AppAuth | null => {
  return isConfigured(loadConfig()) ? getAppAuth() : null;
};
