import { APIError } from "better-auth/api";
import type { Auth } from "./better-auth";
import type { SessionStore } from "./session-store";

/** Better Auth's answer to a wrong email, password or disabled user: a 4xx, not a crash. */
const isRefusal = (error: unknown) =>
  error instanceof APIError && error.statusCode >= 400 && error.statusCode < 500;

export function betterAuthSessionStore(auth: Auth): SessionStore {
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
        if (error instanceof APIError && error.body?.code === "INVALID_PASSWORD") return false;
        throw error;
      }
    },
  };
}
