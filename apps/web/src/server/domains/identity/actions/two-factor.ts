import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { betterAuthSessionStore } from "../repositories/better-auth-session-store";
import { betterAuthTwoFactorStore } from "../repositories/better-auth-two-factor-store";
import { kyselyIdentityRepository } from "../repositories/kysely-identity-repository";
import * as service from "../services/two-factor";

export type {
  ConfirmTwoFactorResult,
  RegenerateBackupCodesResult,
  StartTwoFactorResult,
  TurnOffTwoFactorResult,
} from "../services/two-factor";

/**
 * Two-factor sign-in on your own account (feature 105), for `/account/security`'s server actions.
 * `app` defaults to the running server's instance; tests pass their own.
 */
const deps = ({ auth, db, dialect, limiter }: AppAuth): service.TwoFactorDeps => {
  return {
    sessions: betterAuthSessionStore(auth),
    twoFactor: betterAuthTwoFactorStore(auth, db),
    repo: kyselyIdentityRepository(db, dialect),
    limiter,
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
