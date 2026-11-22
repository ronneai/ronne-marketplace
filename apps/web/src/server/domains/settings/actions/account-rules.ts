import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import * as service from "../services/account-rules";

const deps = (app: AppAuth) => ({ repo: kyselySettingsRepository(app.db, app.dialect) });
const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** Admin › Settings › Authentication's *Who may create accounts* panel (191): root only. */
export const adminAccountRules = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.accountRulesSettings(deps(app), await actor(headers, app));

/** Root saves the block list and the throwaway setting (191). */
export const adminSetAccountRules = async (
  headers: Headers,
  input: service.AccountRulesInput,
  app: AppAuth = getAppAuth(),
) => service.setAccountRules(deps(app), await actor(headers, app), input);
