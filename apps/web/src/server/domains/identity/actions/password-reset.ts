import { loadConfig } from "../../../config";
import { hostCommand } from "../../../runtime";
import { mailReadiness } from "../../mail/actions/mail";
import { instanceHost } from "../../mail/services/mail-admin";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { passwordResetPolicy } from "../../settings/services/password-reset";
import { signUpPolicy } from "../../settings/services/sign-up";
import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import { kyselyPasswordResetRepository } from "../repositories/kysely-password-reset-repository";
import * as service from "../services/password-reset";

/** What the reset needs from the server (194): AUTH_SECRET, the public address, a clock. */
export type PasswordResetContext = { authSecret: string; publicUrl?: string; now?: () => Date };

const serverContext = (): PasswordResetContext => {
  const config = loadConfig();
  if (!config.authSecret) throw new Error("AUTH_SECRET isn't set");
  return { authSecret: config.authSecret, publicUrl: config.publicUrl };
};

/** The service's dependencies on this instance: its database, limits and settings. */
export const passwordResetDeps = (
  app: AppAuth,
  context: PasswordResetContext = serverContext(),
): service.PasswordResetDeps => {
  const settings = kyselySettingsRepository(app.db, app.dialect);
  return {
    repo: kyselyPasswordResetRepository(app.db, app.dialect, context.authSecret),
    limits: app.rateLimits,
    authSecret: context.authSecret,
    // Open while root's setting is on, email is set up and the contact is set: when email stops
    // (or the contact goes), *Forgot?* shows the old note again, and codes already sent still work.
    openness: async () => {
      const [policy, mail, signUp] = await Promise.all([
        passwordResetPolicy(settings),
        mailReadiness(app),
        signUpPolicy(settings),
      ]);
      return {
        open: policy.enabled && mail.sending && mail.contact !== "",
        codeMinutes: signUp.codeMinutes,
        challenge: signUp.challenge,
      };
    },
    mail: async () => ({
      host: instanceHost(context.publicUrl),
      contact: (await mailReadiness(app)).contact,
      command: hostCommand("reset-root-password"),
    }),
    ...(context.now ? { now: context.now } : {}),
  };
};

/** Whether reset by email is open now: *Forgot?* opens `/sign-in/forgot`, else today's note. */
export const passwordResetOpenness = (
  app: AppAuth = getAppAuth(),
  context?: PasswordResetContext,
) => passwordResetDeps(app, context).openness();

/** The request page, posted. */
export const requestPasswordReset = (
  headers: Headers,
  input: Omit<service.ResetRequest, "ip">,
  app: AppAuth = getAppAuth(),
  context?: PasswordResetContext,
) =>
  service.requestPasswordReset(passwordResetDeps(app, context), {
    ...input,
    ip: clientIp(headers, app.trustProxy),
  });
