import type { TestDb } from "../../../db/testing/test-db";
import { LoginRateLimiter } from "../models/login-rate-limiter";
import type { AppAuth } from "../repositories/auth-instance";
import { createAuth } from "../repositories/better-auth";

export const TEST_BASE_URL = "http://localhost:3000";

/** An AppAuth on a test database, like the one getAppAuth() builds for the server. */
export const testAppAuth = (
  t: TestDb,
  options: { trustProxy?: boolean; limiter?: LoginRateLimiter; baseURL?: string } = {},
): AppAuth => {
  const trustProxy = options.trustProxy ?? false;
  return {
    auth: createAuth({
      db: t.db,
      dialect: t.dialect,
      secret: "test-secret-test-secret-test-secret-00",
      baseURL: options.baseURL ?? TEST_BASE_URL,
      trustProxy,
    }),
    db: t.db,
    dialect: t.dialect,
    trustProxy,
    limiter: options.limiter ?? new LoginRateLimiter(),
  };
};

/** Creates a user with a password, the way root will in 008. Returns the user id. */
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
  if (user.role && user.role !== "user") {
    await app.db
      .updateTable("user")
      .set({ role: user.role })
      .where("id", "=", created.id)
      .execute();
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
