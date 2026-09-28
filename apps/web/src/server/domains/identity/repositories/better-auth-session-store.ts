import { isAPIError } from "better-auth/api";
import type { Auth } from "./better-auth";
import type { SessionStore } from "./session-store";

/**
 * Better Auth's answer to a wrong email, password or disabled user: a 4xx, not a crash.
 * `isAPIError`, not `instanceof APIError`: under `next dev`, Turbopack can load better-auth more
 * than once (the page and its server actions are separate layers), and an error thrown by one copy
 * isn't an instance of the other's class. The wrong-credentials error then escaped as a crash.
 */
const isRefusal = (error: unknown) =>
  isAPIError(error) && error.statusCode >= 400 && error.statusCode < 500;

export const betterAuthSessionStore = (auth: Auth): SessionStore => {
  return {
    async currentSession(headers) {
      const found = await auth.api.getSession({ headers });
      return found ? { userId: found.user.id, sessionId: found.session.id } : null;
    },

    async signIn(headers, { email, password, rememberMe }) {
      try {
        const { headers: responseHeaders, response } = await auth.api.signInEmail({
          body: { email, password, rememberMe },
          headers,
          returnHeaders: true,
        });
        // The response carries the session token; only its id leaves this module.
        const ctx = await auth.$context;
        const found = await ctx.internalAdapter.findSession(response.token);
        if (!found) throw new Error("Better Auth signed in but its session can't be found.");
        return {
          headers: responseHeaders,
          session: { userId: found.user.id, sessionId: found.session.id },
        };
      } catch (error) {
        // Unknown email, wrong password, and a disabled user (the session hook refuses it) all
        // end here, so the caller can't tell them apart.
        if (isRefusal(error)) return null;
        throw error;
      }
    },

    async signOut(headers) {
      try {
        await auth.api.signOut({ headers });
      } catch (error) {
        if (!isRefusal(error)) throw error;
      }
    },

    async changePassword(headers, current, next) {
      try {
        await auth.api.changePassword({
          body: { currentPassword: current, newPassword: next, revokeOtherSessions: true },
          headers,
        });
        return true;
      } catch (error) {
        if (isAPIError(error) && error.body?.code === "INVALID_PASSWORD") return false;
        throw error;
      }
    },
  };
};
