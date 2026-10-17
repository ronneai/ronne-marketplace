import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, isAPIError } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";

/** The body, as a Standard Schema (better-call takes any; `zod` isn't a dependency of the app). */
const body = {
  "~standard": {
    version: 1 as const,
    vendor: "ronne",
    validate: (value: unknown) =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as { userId?: unknown }).userId === "string"
        ? { value: { userId: (value as { userId: string }).userId } }
        : { issues: [{ message: "userId is required" }] },
    types: undefined as unknown as { input: { userId: string }; output: { userId: string } },
  },
};

/**
 * Opens a session for the user an identity provider's sign-in decided on (feature 106): the same
 * cookie and session as a password sign-in without "Remember me", so 24 hours at most, never
 * extended, and ended when the browser closes (decision 12: someone disabled at the provider
 * loses Ronne within a day, without SCIM). Better Auth skips the refresh because of its signed
 * `dont_remember` cookie; signing in again is usually one click. `SERVER_ONLY`: it is a
 * 404 over HTTP whatever the allowlist says, so only identity's callback (through `auth.api`)
 * can call it. The disabled-user check on session creation (`databaseHooks`) still runs.
 */
export const ssoSessionPlugin = () =>
  ({
    id: "ronne-sso-session",
    endpoints: {
      ronneSsoSession: createAuthEndpoint(
        "/ronne/sso-session",
        { method: "POST", body, metadata: { SERVER_ONLY: true } },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId);
          if (!user) throw new APIError("UNAUTHORIZED");
          const session = await ctx.context.internalAdapter.createSession(user.id, true);
          if (!session) throw new APIError("UNAUTHORIZED");
          await setSessionCookie(ctx, { session, user }, true);
          return ctx.json({ sessionId: session.id });
        },
      ),
    },
    hooks: {
      after: [
        {
          // A password sign-in with "Remember me" that succeeds clears the `dont_remember` mark a provider's
          // session left in this browser: otherwise its session would never be extended, and
          // with two-factor (whose second step reads the mark) it would last 24 hours.
          matcher: (ctx) => ctx.path === "/sign-in/email",
          handler: createAuthMiddleware(async (ctx) => {
            // Only a sign-in that worked (a session, or two-factor's challenge for one): a failed
            // attempt changes nothing (after hooks see its error too), or it would let a
            // provider's session be extended.
            if (ctx.body?.rememberMe === false || isAPIError(ctx.context.returned)) return;
            const { name, attributes } = ctx.context.authCookies.dontRememberToken;
            ctx.setCookie(name, "", { ...attributes, maxAge: 0 });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
