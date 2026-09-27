import { redirect } from "next/navigation";
import { clientIp } from "../models/client-ip";
import { PATH_HEADER, signInUrl } from "../models/route-guard";
import type { CurrentUser } from "../models/user";
import { type AppAuth, getAppAuth, getAppAuthIfConfigured } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/session";

export { PATH_HEADER } from "../models/route-guard";
export type { ChangePasswordResult, SignInInput, SignInResult } from "../services/session";

/**
 * Entry points for pages, layouts and server actions. `app` defaults to the running server's
 * instance; tests pass their own.
 */
function deps({ auth, db, dialect, limiter }: AppAuth): service.SessionDeps {
  return {
    sessions: betterAuthSessionStore(auth),
    repo: kyselyIdentityRepository(db, dialect),
    limiter,
  };
}

/** The signed-in user, or null. Before setup it's always null (the root layout shows the setup screen). */
export async function getCurrentUser(
  headers: Headers,
  app: AppAuth | null = getAppAuthIfConfigured(),
): Promise<CurrentUser | null> {
  return app ? service.currentUser(deps(app), headers) : null;
}

/** The signed-in user, or a redirect to sign-in that comes back to the requested page. */
export async function requireUser(headers: Headers, app?: AppAuth): Promise<CurrentUser> {
  const user = await getCurrentUser(headers, app);
  if (user) return user;
  redirect(signInUrl(headers.get(PATH_HEADER) ?? "/"));
}

export function signIn(
  headers: Headers,
  input: service.SignInInput,
  app: AppAuth = getAppAuth(),
): Promise<service.SignInResult> {
  return service.signIn(deps(app), headers, input, clientIp(headers, app.trustProxy));
}

export const changePassword = (
  headers: Headers,
  input: { current: string; next: string },
  app: AppAuth = getAppAuth(),
) => service.changePassword(deps(app), headers, input);

export const signOut = (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.signOut(deps(app), headers);
