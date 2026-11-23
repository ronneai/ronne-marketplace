import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { mailReadiness } from "../../mail/actions/mail";
import { lockedMailReadiness } from "../../mail/services/mail-admin";
import type { PasswordResetReadiness } from "../models/password-reset-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import type { SettingsRepository } from "../repositories/settings-repository";
import * as service from "../services/password-reset";

const deps = (app: AppAuth) => ({ repo: kyselySettingsRepository(app.db, app.dialect) });
const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** What reset by email needs before it can be on (194): email set up and working, and a contact. */
export const passwordResetReadiness = async (
  app: AppAuth = getAppAuth(),
): Promise<PasswordResetReadiness> => {
  const mail = await mailReadiness(app);
  return { mail: mail.sending, working: mail.working, contact: mail.contact !== "" };
};

/** Admin › Settings › Authentication: the setting and what blocks it. */
export const adminPasswordResetSettings = async (headers: Headers, app: AppAuth = getAppAuth()) => {
  const policy = await service.passwordResetSettings(deps(app), await actor(headers, app));
  return { policy, readiness: await passwordResetReadiness(app) };
};

/** Root turns reset by email on or off. */
export const adminSetPasswordResetPolicy = async (
  headers: Headers,
  input: { enabled?: unknown },
  app: AppAuth = getAppAuth(),
) => service.setPasswordResetPolicy(deps(app), await actor(headers, app), input, readinessIn);

/** Readiness read in the setting's own transaction, holding the contact's row (194). */
export const readinessIn = async (repo: SettingsRepository): Promise<PasswordResetReadiness> => {
  const mail = await lockedMailReadiness(repo);
  return { mail: mail.sending, working: mail.working, contact: mail.contact !== "" };
};
