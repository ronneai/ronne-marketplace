import { redirect } from "next/navigation";
import { setRequestUser } from "../../../log";
import { clientIp } from "../models/client-ip";
import { PATH_HEADER, signInUrl } from "../models/route-guard";
import type { CurrentUser } from "../models/user";
import { type AppAuth, getAppAuth, getAppAuthIfConfigured } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as localeService from "../services/locale";
import * as service from "../services/session";
import { effectivePasswordPolicy } from "./password-policy";

export { PATH_HEADER } from "../models/route-guard";
export type { SetLocaleResult } from "../services/locale";
export type { ChangePasswordResult, SignInInput, SignInResult } from "../services/session";

/**
 * Entry points for pages, layouts and server actions. `app` defaults to the running server's
 * instance; tests pass their own.
 */
const deps = (app: AppAuth): service.SessionDeps => {
  const { auth, db, dialect, limiter } = app;
  return {
    sessions: betterAuthSessionStore(auth),
    repo: kyselyIdentityRepository(db, dialect),
    limiter,
    passwordPolicy: () => effectivePasswordPolicy(app),
  };
};

/** The signed-in user, or null. Before setup it's always null (the root layout shows the setup screen). */
export const getCurrentUser = async (
  headers: Headers,
  app: AppAuth | null = getAppAuthIfConfigured(),
): Promise<CurrentUser | null> => {
  const user = app ? await service.currentUser(deps(app), headers) : null;
  // The request's lines say who's signed in (feature 100): the id, never an email or a name.
  if (user) setRequestUser(user.id);
  return user;
};

/** The signed-in user, or a redirect to sign-in that comes back to the requested page. */
export const requireUser = async (headers: Headers, app?: AppAuth): Promise<CurrentUser> => {
  const user = await getCurrentUser(headers, app);
  if (user) return user;
  redirect(signInUrl(headers.get(PATH_HEADER) ?? "/"));
};

/** The request's context for the audit log: headers, and the client IP when it can be trusted. */
const context = (headers: Headers, app: AppAuth): service.RequestContext => ({
  headers,
  ip: clientIp(headers, app.trustProxy),
});

export const signIn = (
  headers: Headers,
  input: service.SignInInput,
  app: AppAuth = getAppAuth(),
): Promise<service.SignInResult> => {
  return service.signIn(deps(app), context(headers, app), input);
};

export const changePassword = (
  headers: Headers,
  input: { current: string; next: string },
  app: AppAuth = getAppAuth(),
) => service.changePassword(deps(app), context(headers, app), input);

export const signOut = (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.signOut(deps(app), context(headers, app));

/** Saves the signed-in person's language (129): `en`, `pt`, `fr`, or null for automatic. */
export const setLocale = (headers: Headers, value: unknown, app: AppAuth = getAppAuth()) =>
  localeService.setLocale(deps(app), headers, value);
