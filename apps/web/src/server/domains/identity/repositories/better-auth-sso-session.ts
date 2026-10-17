import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
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
 * cookie and session as a password sign-in, 30 days like "Remember me". `SERVER_ONLY`: it is a
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
          const session = await ctx.context.internalAdapter.createSession(user.id, false);
          if (!session) throw new APIError("UNAUTHORIZED");
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ sessionId: session.id });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
