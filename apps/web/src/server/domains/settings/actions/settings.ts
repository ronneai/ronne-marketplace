import { loadConfig } from "../../../config";
import { hasUsableProvider } from "../../identity/actions/password-policy";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { scanSetupNow } from "../../scans/actions/scans";
import { parseAllowedHosts, type Resolver } from "../../scans/models/endpoint";
import type { ScanSetup } from "../../scans/services/scan-setup";
import { systemResolver } from "../../scans/services/system-resolver";
import type { SkillScanner } from "../models/skill-scan-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import * as service from "../services/settings";
import type { ScanSetupInput } from "../services/skill-scan-setup";
import * as setup from "../services/skill-scan-setup";

export type { InstanceSettings } from "../services/settings";

/**
 * What settings may show of the scanner's setup (135, 136): whether a command is set, the
 * provider's name, model and host, and where each part comes from. Never the provider's variables
 * or the key: they stay on the server.
 */
export const skillScannerFrom = (setup: ScanSetup): SkillScanner => ({
  configured: setup.command !== null,
  provider: setup.provider
    ? { name: setup.provider.name, model: setup.provider.model, host: setup.provider.host }
    : null,
  setup: setup.shown,
});

const skillScanner = async (app: AppAuth): Promise<SkillScanner> =>
  skillScannerFrom(await scanSetupNow(app));

export const skillScanSettings = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.skillScanSettings(deps(app), await actor(headers, app), await skillScanner(app));

export const setSkillScanPolicy = async (
  headers: Headers,
  value: { enabled: unknown; types: unknown; analysis: unknown },
  app: AppAuth = getAppAuth(),
) =>
  service.setSkillScanPolicy(deps(app), await actor(headers, app), value, await skillScanner(app));

/** Root's scanner setup (136): the command, timeout and provider, with the write-only key. */
export const setSkillScanSetup = async (
  headers: Headers,
  value: ScanSetupInput,
  app: AppAuth = getAppAuth(),
  /** For tests: a resolver of their own. */
  resolve: Resolver = systemResolver(),
) => {
  const config = loadConfig();
  return setup.setSkillScanSetup(deps(app), await actor(headers, app), value, {
    shown: (await scanSetupNow(app)).shown,
    authSecret: config.authSecret,
    allowedHosts: parseAllowedHosts(config.skillScanner?.httpHosts),
    resolve,
  });
};

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
