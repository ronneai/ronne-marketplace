import { loadConfig } from "../../../config";
import { hasUsableProvider } from "../../identity/actions/password-policy";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { parseScannerCommand, scanProvider } from "../../scans/services/command-scanner";
import type { SkillScanner } from "../models/skill-scan-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import * as service from "../services/settings";

export type { InstanceSettings } from "../services/settings";

/**
 * What settings may show of the operator's scanner setup: whether a command is set, and the
 * provider's name, model and host. Never its variables, which hold the key: they stay on the server.
 */
export const skillScannerFrom = (
  config: { command?: string; env: Record<string, string> } | undefined,
): SkillScanner => {
  const provider = scanProvider(config?.env ?? {});
  return {
    configured: parseScannerCommand(config?.command) !== null,
    provider: provider ? { name: provider.name, model: provider.model, host: provider.host } : null,
  };
};

const skillScanner = (): SkillScanner => skillScannerFrom(loadConfig().skillScanner);

export const skillScanSettings = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.skillScanSettings(deps(app), await actor(headers, app), skillScanner());

export const setSkillScanPolicy = async (
  headers: Headers,
  value: { enabled: unknown; types: unknown; analysis: unknown },
  app: AppAuth = getAppAuth(),
) => service.setSkillScanPolicy(deps(app), await actor(headers, app), value, skillScanner());

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

export const setUsageMinimum = async (
  headers: Headers,
  value: unknown,
  app: AppAuth = getAppAuth(),
) => service.setUsageMinimum(deps(app), await actor(headers, app), value);

/** The usage minimum, for the item page (047). */
export const usageMinimum = (app: AppAuth = getAppAuth()) => service.usageMinimum(deps(app));

/** The usage policy, for the usage API (anyone may follow it; only root changes it). */
export const usagePolicy = (app: AppAuth = getAppAuth()) => service.usagePolicy(deps(app));

export const setTwoFactorPolicy = async (
  headers: Headers,
  value: unknown,
  app: AppAuth = getAppAuth(),
) => service.setTwoFactorPolicy(deps(app), await actor(headers, app), value);

export const setRetention = async (
  headers: Headers,
  value: { ipDays: unknown; sessionsDays: unknown; feedbackDays?: unknown },
  app: AppAuth = getAppAuth(),
) => service.setRetention(deps(app), await actor(headers, app), value);

/** How long personal data is kept (102), for the purge. */
export const retentionPolicy = (app: AppAuth = getAppAuth()) => service.retentionPolicy(deps(app));

/** Who must use two-factor sign-in (105), for the hold on pages and actions. */
export const twoFactorPolicy = (app: AppAuth = getAppAuth()) => service.twoFactorPolicy(deps(app));

/**
 * Who may sign in with a password (106): *Root only* needs a tested, enabled provider and the
 * confirm that everyone but root loses their password sign-in.
 */
export const setPasswordSignInPolicy = async (
  headers: Headers,
  value: unknown,
  confirmed: boolean,
  app: AppAuth = getAppAuth(),
) =>
  service.setPasswordSignInPolicy(deps(app), await actor(headers, app), value, {
    usableProvider: () => hasUsableProvider(app),
    confirmed,
  });

export const setNotice = async (
  headers: Headers,
  input: Parameters<typeof service.setNotice>[2],
  app: AppAuth = getAppAuth(),
) => service.setNotice(deps(app), await actor(headers, app), input);

/** The instance notice (124), for the signed-in pages. */
export const notice = (app: AppAuth = getAppAuth()) => service.notice(deps(app));
