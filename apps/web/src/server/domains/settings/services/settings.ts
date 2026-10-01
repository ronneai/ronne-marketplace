import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { InvalidUsagePolicyError } from "../exceptions/errors";
import {
  DEFAULT_USAGE_POLICY,
  isUsagePolicy,
  USAGE_POLICY_KEY,
  type UsagePolicy,
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

export type InstanceSettings = {
  usagePolicy: UsagePolicy;
  /** When root last changed it, or null while it's the default. */
  usagePolicyChangedAt: Date | null;
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
  };
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
