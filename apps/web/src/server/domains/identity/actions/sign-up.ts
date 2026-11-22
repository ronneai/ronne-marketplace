import { loadConfig } from "../../../config";
import { instanceHost } from "../../mail/services/mail-admin";
import { storedMailSetup } from "../../mail/services/mail-setup";
import { signUpReadiness } from "../../settings/actions/sign-up";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { readAccountRules } from "../../settings/services/account-rules";
import { signUpBlockers, signUpPolicy } from "../../settings/services/sign-up";
import { clientIp } from "../models/client-ip";
import { argon2PasswordHasher } from "../repositories/argon2-password-hasher";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselySignUpRepository } from "../repositories/kysely-sign-up-repository";
import * as service from "../services/sign-up";

/** What self-registration needs from the server (190): AUTH_SECRET, the public address, a clock. */
export type SignUpContext = { authSecret: string; publicUrl?: string; now?: () => Date };

const serverContext = (): SignUpContext => {
  const config = loadConfig();
  if (!config.authSecret) throw new Error("AUTH_SECRET isn't set");
  return { authSecret: config.authSecret, publicUrl: config.publicUrl };
};

/** The service's dependencies on this instance: its database, limits and settings. */
export const signUpDeps = (
  app: AppAuth,
  context: SignUpContext = serverContext(),
): service.SignUpDeps => {
  const settings = kyselySettingsRepository(app.db, app.dialect);
  return {
    repo: kyselySignUpRepository(app.db, app.dialect, context.authSecret),
    hasher: argon2PasswordHasher,
    limits: app.rateLimits,
    authSecret: context.authSecret,
    openness: async () => {
      const [policy, readiness, rules] = await Promise.all([
        signUpPolicy(settings),
        signUpReadiness(app),
        readAccountRules(settings),
      ]);
      return {
        ...policy,
        open: policy.enabled && signUpBlockers(readiness).length === 0,
        blocked: rules,
      };
    },
    mail: async () => ({
      host: instanceHost(context.publicUrl),
      contact: (await storedMailSetup(settings)).contact,
    }),
    ...(context.now ? { now: context.now } : {}),
  };
};

/** Whether sign-up is open now: the sign-in page's link, and `/sign-up` (404 otherwise). */
export const signUpOpenness = (app: AppAuth = getAppAuth(), context?: SignUpContext) =>
  signUpDeps(app, context).openness();

const ip = (headers: Headers, app: AppAuth) => clientIp(headers, app.trustProxy);

/** The sign-up form, posted. */
export const requestSignUp = (
  headers: Headers,
  input: Omit<service.SignUpRequest, "ip">,
  app: AppAuth = getAppAuth(),
  context?: SignUpContext,
) => service.requestSignUp(signUpDeps(app, context), { ...input, ip: ip(headers, app) });

/** The code page's state for this browser's sign-up. */
export const signUpCodePage = (
  id: string | null,
  app: AppAuth = getAppAuth(),
  context?: SignUpContext,
) => service.codePage(signUpDeps(app, context), id);

/** The code, typed. */
export const enterSignUpCode = (
  headers: Headers,
  input: { id: string | null; code: unknown },
  app: AppAuth = getAppAuth(),
  context?: SignUpContext,
) => service.enterSignUpCode(signUpDeps(app, context), { ...input, ip: ip(headers, app) });

/** **Send a new code**. */
export const resendSignUpCode = (
  headers: Headers,
  id: string | null,
  app: AppAuth = getAppAuth(),
  context?: SignUpContext,
) => service.resendSignUpCode(signUpDeps(app, context), { id, ip: ip(headers, app) });

/** **Use another email**. */
export const cancelSignUp = (
  id: string | null,
  app: AppAuth = getAppAuth(),
  context?: SignUpContext,
) => service.cancelSignUp(signUpDeps(app, context), id);
