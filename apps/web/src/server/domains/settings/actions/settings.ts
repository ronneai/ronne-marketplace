import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import * as service from "../services/settings";

export type { InstanceSettings } from "../services/settings";

/** Instance settings (feature 046). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth): service.SettingsDeps => ({
  repo: kyselySettingsRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const instanceSettings = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.instanceSettings(deps(app), await actor(headers, app));

export const setUsagePolicy = async (
  headers: Headers,
  value: unknown,
  app: AppAuth = getAppAuth(),
) => service.setUsagePolicy(deps(app), await actor(headers, app), value);

/** The usage policy, for the usage API (anyone may follow it; only root changes it). */
export const usagePolicy = (app: AppAuth = getAppAuth()) => service.usagePolicy(deps(app));
