import { isConfigured, loadConfig } from "../../../config";
import type { Db } from "../../../db/create-db";
import { getAppDb } from "../../../db/instance";
import type { DatabaseDialect } from "../../../db/url";
import { NotConfiguredError } from "../exceptions/errors";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import { type Auth, createAuth } from "./better-auth";

export type AppAuth = {
  auth: Auth;
  db: Db;
  dialect: DatabaseDialect;
  trustProxy: boolean;
  limiter: LoginRateLimiter;
};

// Kept on globalThis, like the database pools, so development hot reloads reuse them. The limiter
// is shared across settings: its counts must survive a reload too.
const shared = globalThis as typeof globalThis & {
  __ronneAuth?: Map<string, Auth>;
  __ronneAuthFactory?: typeof createAuth;
  __ronneLoginLimiter?: LoginRateLimiter;
};

/**
 * Drops what a hot reload left behind from older code (105): a limiter made by an earlier version
 * of its class (it lacked `check`, and `pnpm dev` crashed on /account/security), or Better Auth
 * instances made by an earlier `createAuth` (they'd lack a plugin added since). Unchanged code
 * keeps them, and production loads each module once.
 */
export const dropStale = (): void => {
  if (shared.__ronneAuthFactory !== createAuth) {
    shared.__ronneAuth = new Map();
    shared.__ronneAuthFactory = createAuth;
  }
  if (!(shared.__ronneLoginLimiter instanceof LoginRateLimiter))
    shared.__ronneLoginLimiter = new LoginRateLimiter();
};

/** The running server's Better Auth instance and login limiter, for the current settings. */
export const getAppAuth = (): AppAuth => {
  const config = loadConfig();
  if (!isConfigured(config)) throw new NotConfiguredError();
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
  const limiter = shared.__ronneLoginLimiter ?? new LoginRateLimiter();
  shared.__ronneLoginLimiter = limiter;
  return { auth, db, dialect, trustProxy: config.trustProxy, limiter };
};

/** The same, or null before setup: then there's no one to sign in, and no database to ask. */
export const getAppAuthIfConfigured = (): AppAuth | null => {
  return isConfigured(loadConfig()) ? getAppAuth() : null;
};
