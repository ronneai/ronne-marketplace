import { isConfigured, loadConfig } from "../../../config";
import { getAppDb } from "../../../db/instance";
import { NotConfiguredError } from "../exceptions/errors";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import { type Auth, createAuth } from "./better-auth";

export type AppAuth = { auth: Auth; trustProxy: boolean; limiter: LoginRateLimiter };

// Kept on globalThis, like the database pools, so development hot reloads reuse them. The limiter
// is shared across settings: its counts must survive a reload too.
const shared = globalThis as typeof globalThis & {
  __ronneAuth?: Map<string, Auth>;
  __ronneLoginLimiter?: LoginRateLimiter;
};

/** The running server's Better Auth instance and login limiter, for the current settings. */
export function getAppAuth(): AppAuth {
  const config = loadConfig();
  if (!isConfigured(config)) throw new NotConfiguredError();
  const baseURL = config.publicUrl ?? "http://localhost:3000";

  shared.__ronneAuth ??= new Map();
  const key = JSON.stringify([config.databaseUrl, config.authSecret, baseURL, config.trustProxy]);
  let auth = shared.__ronneAuth.get(key);
  if (!auth) {
    const { db, dialect } = getAppDb(config.databaseUrl);
    auth = createAuth({
      db,
      dialect,
      secret: config.authSecret,
      baseURL,
      trustProxy: config.trustProxy,
    });
    shared.__ronneAuth.set(key, auth);
  }
  shared.__ronneLoginLimiter ??= new LoginRateLimiter();
  return { auth, trustProxy: config.trustProxy, limiter: shared.__ronneLoginLimiter };
}
