import { clientIp } from "../models/client-ip";
import type { TwoFactorRequirement } from "../models/two-factor-coverage";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { betterAuthTwoFactorStore } from "../repositories/better-auth-two-factor-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/two-factor";
import { effectivePasswordPolicy } from "./password-policy";

export type {
  CompleteTwoFactorResult,
  ConfirmTwoFactorResult,
  RegenerateBackupCodesResult,
  StartTwoFactorResult,
  TurnOffTwoFactorResult,
} from "../services/two-factor";

/**
 * Two-factor sign-in on your own account (feature 105), for `/account/security`'s server actions.
 * `app` defaults to the running server's instance; tests pass their own.
 */
const deps = (app: AppAuth): service.TwoFactorDeps => {
  const { auth, db, dialect, limiter } = app;
  return {
    sessions: betterAuthSessionStore(auth),
    twoFactor: betterAuthTwoFactorStore(auth, db, dialect),
    repo: kyselyIdentityRepository(db, dialect),
    limiter,
    passwordPolicy: () => effectivePasswordPolicy(app),
  };
};

const context = (headers: Headers, app: AppAuth) => ({
  headers,
  ip: clientIp(headers, app.trustProxy),
});

export const twoFactorStatus = (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.twoFactorStatus(deps(app), context(headers, app));

export const startTwoFactor = (
  headers: Headers,
  input: { password: string; startOver?: boolean },
  app: AppAuth = getAppAuth(),
) => service.startTwoFactor(deps(app), context(headers, app), input);

export const confirmTwoFactor = (
  headers: Headers,
  input: { code: string; uri: string },
  app: AppAuth = getAppAuth(),
) => service.confirmTwoFactor(deps(app), context(headers, app), input);

export const regenerateBackupCodes = (
  headers: Headers,
  input: { password: string },
  app: AppAuth = getAppAuth(),
) => service.regenerateBackupCodes(deps(app), context(headers, app), input);

export const turnOffTwoFactor = (
  headers: Headers,
  input: { password: string; code: string },
  app: AppAuth = getAppAuth(),
) => service.turnOffTwoFactor(deps(app), context(headers, app), input);

/** The second step at sign-in (105): a code for the request's challenge. */
export const completeTwoFactorSignIn = (
  headers: Headers,
  input: { code: string; method: "totp" | "backup_code" },
  app: AppAuth = getAppAuth(),
) => service.completeTwoFactorSignIn(deps(app), context(headers, app), input);

/** Whether the signed-in person must enrol before using the app (105), under root's requirement. */
export const mustEnrol = (
  headers: Headers,
  requirement: TwoFactorRequirement,
  app: AppAuth = getAppAuth(),
) => service.mustEnrol(deps(app), context(headers, app), requirement);

/** The coverage counts for root's Two-factor sign-in panel. */
export const twoFactorCoverage = (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.twoFactorCoverage(deps(app), context(headers, app));
