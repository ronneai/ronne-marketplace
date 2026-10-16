import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  InvalidTwoFactorPolicyError,
  InvalidUsageMinimumError,
  InvalidUsagePolicyError,
} from "../exceptions/errors";
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

export type InstanceSettings = {
  usagePolicy: UsagePolicy;
  /** When root last changed it, or null while it's the default. */
  usagePolicyChangedAt: Date | null;
  usageMinimum: number;
  twoFactorPolicy: TwoFactorPolicy;
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
  };
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
