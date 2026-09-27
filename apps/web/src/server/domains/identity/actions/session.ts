import type { CurrentUser } from "../models/user";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/session";

/**
 * Entry points for pages, layouts and server actions. `app` defaults to the running server's
 * instance; tests pass their own.
 */
function deps({ auth, db, dialect }: AppAuth): service.SessionDeps {
  return { sessions: betterAuthSessionStore(auth), repo: kyselyIdentityRepository(db, dialect) };
}

export const getCurrentUser = (
  headers: Headers,
  app: AppAuth = getAppAuth(),
): Promise<CurrentUser | null> => service.currentUser(deps(app), headers);
