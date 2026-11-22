import { effectivePasswordPolicy } from "../../identity/actions/password-policy";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { mailReadiness } from "../../mail/actions/mail";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import * as service from "../services/sign-up";

const deps = (app: AppAuth) => ({ repo: kyselySettingsRepository(app.db, app.dialect) });
const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/**
 * What sign-up needs before it can be on (190): email set up, the instance contact, and password
 * sign-in open to everyone, read as sign-in reads it (106's *Root only* holds while a provider is on).
 */
export const signUpReadiness = async (
  app: AppAuth = getAppAuth(),
): Promise<service.SignUpReadiness> => {
  const [mail, password] = await Promise.all([mailReadiness(app), effectivePasswordPolicy(app)]);
  return { mail: mail.sending, contact: mail.contact !== "", password: password === "everyone" };
};

/** Admin › Settings › Authentication's Self-registration panel: the policy and what blocks it. */
export const adminSignUpSettings = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const policy = await service.signUpSettings(deps(app), await actor(headers, app));
  return { policy, readiness: await signUpReadiness(app) };
};

/** Root saves self-registration. */
export const adminSetSignUpPolicy = async (
  headers: Headers,
  input: service.SignUpInput,
  app: AppAuth = getAppAuth(),
) =>
  service.setSignUpPolicy(deps(app), await actor(headers, app), input, await signUpReadiness(app));
