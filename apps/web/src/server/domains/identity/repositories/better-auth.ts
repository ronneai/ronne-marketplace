import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import type { Db } from "../../../db/create-db";
import { newId } from "../../../db/ids";
import type { DatabaseDialect } from "../../../db/url";
import { authSchema } from "../models/auth-schema";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import { COOKIE_PREFIX } from "../models/session-cookie";
import { argon2PasswordHasher } from "./argon2-password-hasher";
import { kyselyIdentityRepository } from "./kysely-identity-repository";

const DAY = 60 * 60 * 24;

/** "Remember me": the session lasts 30 days. Without it, a browser-session cookie (and one day at most). */
export const SESSION_EXPIRES_IN = 30 * DAY;
/** A session in use is extended at most once a day. */
export const SESSION_UPDATE_AGE = DAY;

/**
 * The only Better Auth endpoints served over HTTP, at /api/auth/*. Signing in, changing the
 * password and signing out go through identity's actions (server actions), where Ronne's own rate
 * limit applies; Better Auth's limiter only covers its HTTP routes.
 */
export const HTTP_ENDPOINTS: ReadonlySet<string> = new Set(["/get-session", "/ok"]);

export type AuthConfig = {
  db: Db;
  dialect: DatabaseDialect;
  /** AUTH_SECRET: signs session cookies. */
  secret: string;
  /** PUBLIC_URL: where the web app is served. */
  baseURL: string;
  /** TRUST_PROXY: record the client IP from X-Forwarded-For. */
  trustProxy?: boolean;
  hasher?: PasswordHasher;
};

/**
 * Better Auth, configured for Ronne. Only the identity domain imports this; the rest of the app
 * goes through identity's actions (MVP §9.5).
 */
export const createAuth = ({
  db,
  dialect,
  secret,
  baseURL,
  trustProxy = false,
  hasher = argon2PasswordHasher,
}: AuthConfig) => {
  return betterAuth({
    database: { db, type: dialect },
    secret,
    baseURL,
    trustedOrigins: [baseURL],
    // Better Auth's telemetry is opt-in; keep it off explicitly for a self-hosted product.
    telemetry: { enabled: false },
    // On in every environment, not only production. It covers the few HTTP endpoints left.
    rateLimit: { enabled: true },
    advanced: {
      database: { generateId: () => newId() },
      // Cookies are named ronne.* rather than better-auth.*. They're Secure when baseURL is https.
      cookiePrefix: COOKIE_PREFIX,
      // Without a trusted proxy, X-Forwarded-For can be forged (see models/client-ip.ts), so the
      // address isn't recorded at all.
      ipAddress: trustProxy
        ? { ipAddressHeaders: ["x-forwarded-for"] }
        : { disableIpTracking: true },
    },
    emailAndPassword: {
      enabled: true,
      // Users are created only by root, never through a public sign-up endpoint (MVP §2).
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: {
        hash: (password) => hasher.hash(password),
        verify: ({ hash, password }) => hasher.verify(hash, password),
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Disabled users get no session. Sign-in then fails with the same 401 as a wrong password
          // (returning false would make it a 500).
          before: async (session) => {
            const user = await kyselyIdentityRepository(db, dialect).findActiveUser(session.userId);
            if (!user)
              throw new APIError("UNAUTHORIZED", {
                message: "Invalid email or password",
                code: "INVALID_EMAIL_OR_PASSWORD",
              });
          },
        },
      },
    },
    ...authSchema,
    // After authSchema, which also has a `session` key (its column names).
    session: {
      ...authSchema.session,
      expiresIn: SESSION_EXPIRES_IN,
      updateAge: SESSION_UPDATE_AGE,
    },
    // Lets server actions set the session cookie. It must stay the last plugin.
    plugins: [nextCookies()],
  });
};

export type Auth = ReturnType<typeof createAuth>;
