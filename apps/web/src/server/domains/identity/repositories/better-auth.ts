import { betterAuth } from "better-auth";
import type { Db } from "../../../db/create-db";
import { newId } from "../../../db/ids";
import type { DatabaseDialect } from "../../../db/url";
import { authSchema } from "../models/auth-schema";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../models/password";
import type { PasswordHasher } from "../models/password-hasher";
import { argon2PasswordHasher } from "./argon2-password-hasher";

export type AuthConfig = {
  db: Db;
  dialect: DatabaseDialect;
  /** AUTH_SECRET: signs session cookies. */
  secret: string;
  /** PUBLIC_URL: where the web app is served. */
  baseURL: string;
  hasher?: PasswordHasher;
};

/**
 * Better Auth, configured for Ronne. Only the identity domain imports this; the rest of the app
 * goes through identity's actions (MVP §9.5).
 */
export function createAuth({
  db,
  dialect,
  secret,
  baseURL,
  hasher = argon2PasswordHasher,
}: AuthConfig) {
  return betterAuth({
    database: { db, type: dialect },
    secret,
    baseURL,
    // Better Auth's telemetry is opt-in; keep it off explicitly for a self-hosted product.
    telemetry: { enabled: false },
    advanced: { database: { generateId: () => newId() } },
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
    ...authSchema,
  });
}

export type Auth = ReturnType<typeof createAuth>;
