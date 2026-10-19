import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  ConfirmationNeededError,
  InvalidPasswordSignInPolicyError,
  InvalidRetentionError,
  InvalidTwoFactorPolicyError,
  InvalidUsageMinimumError,
  InvalidUsagePolicyError,
  NoUsableProviderError,
} from "../exceptions/errors";
import {
  DEFAULT_PASSWORD_SIGN_IN_POLICY,
  isPasswordSignInPolicy,
  PASSWORD_SIGN_IN_POLICY_KEY,
  type PasswordSignInPolicy,
} from "../models/password-sign-in-policy";
import {
  DEFAULT_RETENTION_POLICY,
  RETENTION_IP_DAYS_KEY,
  RETENTION_SESSIONS_DAYS_KEY,
  type RetentionPolicy,
  retentionDaysFrom,
} from "../models/retention-policy";
import {
  DEFAULT_TWO_FACTOR_POLICY,
  isTwoFactorPolicy,
  TWO_FACTOR_POLICY_KEY,
  type TwoFactorPolicy,
} from "../models/two-factor-policy";
import {
  DEFAULT_USAGE_MINIMUM,
  DEFAULT_USAGE_POLICY,
  isUsagePolicy,
  USAGE_MINIMUM_KEY,
  USAGE_POLICY_KEY,
  type UsagePolicy,
  usageMinimumFrom,
} from "../models/usage-policy";
import type { SettingsRepository } from "../repositories/settings-repository";

/**
 * Instance settings root changes in the app (feature 046): the usage policy first. Read on every
 * use, so a change takes effect at once, without a restart.
 */
export type SettingsDeps = { repo: SettingsRepository; now?: () => Date };
export type SettingsActor = { user: CurrentUser | null; ip: string | null };

const now = (deps: SettingsDeps) => (deps.now ?? (() => new Date()))();

/** The usage policy, for whoever needs to follow it (the usage API); `off` until root sets one. */
export const usagePolicy = async (deps: SettingsDeps): Promise<UsagePolicy> => {
  const stored = await deps.repo.get(USAGE_POLICY_KEY);
  return stored && isUsagePolicy(stored.value) ? stored.value : DEFAULT_USAGE_POLICY;
};

/** The usage minimum (047): 0, the default, until root sets one. */
export const usageMinimum = async (deps: SettingsDeps): Promise<number> => {
  const stored = await deps.repo.get(USAGE_MINIMUM_KEY);
  return (stored && usageMinimumFrom(stored.value)) ?? DEFAULT_USAGE_MINIMUM;
};

/** Who must use two-factor sign-in (105); `optional` until root sets it. Read on every request. */
export const twoFactorPolicy = async (deps: SettingsDeps): Promise<TwoFactorPolicy> => {
  const stored = await deps.repo.get(TWO_FACTOR_POLICY_KEY);
  return stored && isTwoFactorPolicy(stored.value) ? stored.value : DEFAULT_TWO_FACTOR_POLICY;
};

/**
 * How long personal data is kept (102), for the purge; 90 days each until root sets them. A stored
 * value that isn't in the range (a hand edit) reads as the default, as the other settings do.
 */
export const retentionPolicy = async (deps: SettingsDeps): Promise<RetentionPolicy> => {
  const ip = await deps.repo.get(RETENTION_IP_DAYS_KEY);
  const sessions = await deps.repo.get(RETENTION_SESSIONS_DAYS_KEY);
  return {
    ipDays: (ip && retentionDaysFrom(ip.value)) ?? DEFAULT_RETENTION_POLICY.ipDays,
    sessionsDays:
      (sessions && retentionDaysFrom(sessions.value)) ?? DEFAULT_RETENTION_POLICY.sessionsDays,
  };
};

export type InstanceSettings = {
  usagePolicy: UsagePolicy;
  /** When root last changed it, or null while it's the default. */
  usagePolicyChangedAt: Date | null;
  usageMinimum: number;
  twoFactorPolicy: TwoFactorPolicy;
  passwordSignInPolicy: PasswordSignInPolicy;
  retention: RetentionPolicy;
};

/** What Admin › Settings shows: root only. */
export const instanceSettings = async (
  deps: SettingsDeps,
  actor: SettingsActor,
): Promise<InstanceSettings> => {
  requirePermission(actor.user, "settings.manage");
  const stored = await deps.repo.get(USAGE_POLICY_KEY);
  return {
    usagePolicy: stored && isUsagePolicy(stored.value) ? stored.value : DEFAULT_USAGE_POLICY,
    usagePolicyChangedAt: stored?.updatedAt ?? null,
    usageMinimum: await usageMinimum(deps),
    twoFactorPolicy: await twoFactorPolicy(deps),
    passwordSignInPolicy: await passwordSignInPolicy(deps),
    retention: await retentionPolicy(deps),
  };
};

/**
 * Root sets how long personal data is kept (102): both numbers at once, each a whole number of
 * days from 1 to 3,650, audited as `settings.retention` with the old and new values. The next
 * purge runs by the new values; nothing is purged here.
 */
export const setRetention = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: { ipDays: unknown; sessionsDays: unknown },
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const ipDays = retentionDaysFrom(value.ipDays);
  if (ipDays === null) throw new InvalidRetentionError("ipDays");
  const sessionsDays = retentionDaysFrom(value.sessionsDays);
  if (sessionsDays === null) throw new InvalidRetentionError("sessionsDays");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const from = await retentionPolicy({ repo });
    if (from.ipDays === ipDays && from.sessionsDays === sessionsDays) return { changed: false };
    const by = actor.user?.id ?? null;
    await repo.set(RETENTION_IP_DAYS_KEY, String(ipDays), by, at);
    await repo.set(RETENTION_SESSIONS_DAYS_KEY, String(sessionsDays), by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.retention",
        target: { type: "instance" },
        metadata: { from: { ...from }, to: { ipDays, sessionsDays } },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};

/** Root sets the usage minimum; the change is audited with the old and new value. */
export const setUsageMinimum = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: unknown,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const minimum = usageMinimumFrom(value);
  if (minimum === null) throw new InvalidUsageMinimumError();
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const from = await usageMinimum({ repo });
    if (from === minimum) return { changed: false };
    await repo.set(USAGE_MINIMUM_KEY, String(minimum), actor.user?.id ?? null, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "settings.usage_minimum",
        target: { type: "instance" },
        metadata: { from, to: minimum },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};

/** Root sets the usage policy; the change is audited with the old and new value. */
export const setUsagePolicy = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: unknown,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  if (!isUsagePolicy(value)) throw new InvalidUsagePolicyError();
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const stored = await repo.get(USAGE_POLICY_KEY);
    const from = stored && isUsagePolicy(stored.value) ? stored.value : DEFAULT_USAGE_POLICY;
    if (from === value) return { changed: false };
    await repo.set(USAGE_POLICY_KEY, value, actor.user?.id ?? null, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "settings.usage_policy",
        target: { type: "instance" },
        metadata: { from, to: value },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};

/**
 * Root sets who must use two-factor sign-in (105); audited with the old and new value. It signs
 * nobody out: people it newly covers are asked to enrol at their next request.
 */
export const setTwoFactorPolicy = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: unknown,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  if (!isTwoFactorPolicy(value)) throw new InvalidTwoFactorPolicyError();
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const from = await twoFactorPolicy({ repo });
    if (from === value) return { changed: false };
    await repo.set(TWO_FACTOR_POLICY_KEY, value, actor.user?.id ?? null, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "settings.two_factor_policy",
        target: { type: "instance" },
        metadata: { from, to: value },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};

/** Who may sign in with a password, as root set it (106); `everyone` until root sets one. */
export const passwordSignInPolicy = async (deps: SettingsDeps): Promise<PasswordSignInPolicy> => {
  const stored = await deps.repo.get(PASSWORD_SIGN_IN_POLICY_KEY);
  return stored && isPasswordSignInPolicy(stored.value)
    ? stored.value
    : DEFAULT_PASSWORD_SIGN_IN_POLICY;
};

/**
 * Root sets who may sign in with a password (106); audited as
 * `instance.password_sign_in_changed`. *Root only* needs an enabled provider that has passed its
 * test (`usableProvider`), and a confirm that everyone but root loses their password sign-in.
 * `actorId` null: the command line (`disable-sso`), which only ever goes back to `everyone`.
 */
export const setPasswordSignInPolicy = async (
  deps: SettingsDeps,
  actor: SettingsActor | { user: null; ip: null; system: true },
  value: unknown,
  check: { usableProvider: () => Promise<boolean>; confirmed: boolean },
): Promise<{ changed: boolean }> => {
  if (!("system" in actor)) requirePermission(actor.user, "settings.manage");
  if (!isPasswordSignInPolicy(value)) throw new InvalidPasswordSignInPolicyError();
  const at = now(deps);
  // Checked before the transaction: it reads other tables, which SQLite's one connection can't do
  // inside it. A provider turned off meanwhile is harmless: Root only holds only while one is on.
  if (value === "root_only") {
    if (!(await check.usableProvider())) throw new NoUsableProviderError();
    if (!check.confirmed) throw new ConfirmationNeededError();
  }
  return deps.repo.transaction(async (repo) => {
    const from = await passwordSignInPolicy({ repo });
    if (from === value) return { changed: false };
    await repo.set(PASSWORD_SIGN_IN_POLICY_KEY, value, actor.user?.id ?? null, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "instance.password_sign_in_changed",
        target: { type: "instance" },
        metadata: { from, to: value, ...("system" in actor ? { via: "cli" } : {}) },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};
