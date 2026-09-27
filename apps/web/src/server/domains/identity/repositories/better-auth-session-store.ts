import type { Auth } from "./better-auth";
import type { SessionStore } from "./session-store";

export function betterAuthSessionStore(auth: Auth): SessionStore {
  return {
    async sessionUserId(headers) {
      const session = await auth.api.getSession({ headers });
      return session?.user.id ?? null;
    },
  };
}
