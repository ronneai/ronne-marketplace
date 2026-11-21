import { loadConfig } from "../../../config";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { parseMailRelays } from "../models/mail-settings";
import { resolveAll } from "../repositories/transports/smtp";
import * as admin from "../services/mail-admin";
import * as setup from "../services/mail-setup";

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** The server's side of email (189): AUTH_SECRET, the operator's relays and the public address. */
const serverContext = () => {
  const config = loadConfig();
  return {
    authSecret: config.authSecret,
    allowedHosts: parseMailRelays(config.mailHosts),
    resolve: resolveAll,
    publicUrl: config.publicUrl,
  };
};

/** Admin › Settings › Email: the setup as root sees it, secrets as saved or not. */
export const adminMailSetup = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  setup.mailSetup(
    { repo: kyselySettingsRepository(app.db, app.dialect) },
    await actor(headers, app),
    serverContext(),
  );

/** Root saves the email setup. */
export const adminSaveMailSetup = async (
  headers: Headers,
  input: setup.MailSetupInput,
  app: AppAuth = getAppAuth(),
) =>
  setup.saveMailSetup(
    { repo: kyselySettingsRepository(app.db, app.dialect) },
    await actor(headers, app),
    input,
    serverContext(),
  );

/** Root's test email, to their own address. */
export const adminSendTestEmail = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  admin.sendTestEmail(
    { db: app.db, dialect: app.dialect },
    await actor(headers, app),
    serverContext(),
  );

/** Root stops sending: the transport cleared, the waiting messages dropped. */
export const adminStopSending = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  admin.stopSending({ db: app.db, dialect: app.dialect }, await actor(headers, app));

/** Whether email can go out, and the instance contact: for 190 and 194's switches. */
export const mailReadiness = async (app: AppAuth = getAppAuth()) =>
  admin.mailReadiness(app.db, app.dialect);
