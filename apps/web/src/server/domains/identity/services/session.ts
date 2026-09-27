import type { CurrentUser } from "../models/user";
import type { IdentityRepository } from "../repositories/identity-repository";
import type { SessionStore } from "../repositories/session-store";

export type SessionDeps = { sessions: SessionStore; repo: IdentityRepository };

/**
 * The signed-in user, or null. The user is read again on every call, so disabling someone (or
 * changing their role) takes effect on their next request, even with a valid session cookie.
 */
export async function currentUser(
  deps: SessionDeps,
  headers: Headers,
): Promise<CurrentUser | null> {
  const userId = await deps.sessions.sessionUserId(headers);
  return userId ? deps.repo.findActiveUser(userId) : null;
}
