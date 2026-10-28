import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import {
  ConfirmationNeededError,
  InvalidNoticeError,
  InvalidPasswordSignInPolicyError,
  InvalidRetentionError,
  InvalidSkillScanAnalysisError,
  InvalidSkillScanTypesError,
  InvalidTwoFactorPolicyError,
  InvalidUsageMinimumError,
  InvalidUsagePolicyError,
  NoUsableProviderError,
  SkillScanNoProviderError,
  SkillScanNotConfiguredError,
} from "../exceptions/errors";
import {
  DEFAULT_NOTICE,
  NOTICE_KEY,
  type Notice,
  type NoticeInput,
  noticeContentChanged,
  noticeFrom,
  noticeFromStored,
} from "../models/notice-policy";
import {
  DEFAULT_PASSWORD_SIGN_IN_POLICY,
  isPasswordSignInPolicy,
  PASSWORD_SIGN_IN_POLICY_KEY,
  type PasswordSignInPolicy,
} from "../models/password-sign-in-policy";
import {
  DEFAULT_RETENTION_POLICY,
  RETENTION_FEEDBACK_DAYS_KEY,
  RETENTION_IP_DAYS_KEY,
  RETENTION_SESSIONS_DAYS_KEY,
  type RetentionPolicy,
  retentionDaysFrom,
} from "../models/retention-policy";
import {
  isSkillScanAnalysis,
  SKILL_SCAN_ANALYSIS_KEY,
  SKILL_SCAN_ENABLED_KEY,
  SKILL_SCAN_LAST_ERROR_KEY,
  SKILL_SCAN_LAST_VERSION_KEY,
  SKILL_SCAN_TYPES_KEY,
  type SkillScanner,
  type SkillScanPolicy,
  type SkillScanSettings,
  skillScanPolicyFrom,
  skillScanTypesFrom,
} from "../models/skill-scan-policy";
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

/** The security scan's policy (135): off, skills, static until root sets it. Read on every use. */
export const skillScanPolicy = async (deps: SettingsDeps): Promise<SkillScanPolicy> => {
  const [enabled, types, analysis] = await Promise.all(
    [SKILL_SCAN_ENABLED_KEY, SKILL_SCAN_TYPES_KEY, SKILL_SCAN_ANALYSIS_KEY].map((key) =>
      deps.repo.get(key),
    ),
  );
  return skillScanPolicyFrom({
    enabled: enabled?.value ?? null,
    types: types?.value ?? null,
    analysis: analysis?.value ?? null,
  });
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
  const feedback = await deps.repo.get(RETENTION_FEEDBACK_DAYS_KEY);
  return {
    ipDays: (ip && retentionDaysFrom(ip.value)) ?? DEFAULT_RETENTION_POLICY.ipDays,
    sessionsDays:
      (sessions && retentionDaysFrom(sessions.value)) ?? DEFAULT_RETENTION_POLICY.sessionsDays,
    feedbackDays:
      (feedback && retentionDaysFrom(feedback.value)) ?? DEFAULT_RETENTION_POLICY.feedbackDays,
  };
};

/** The notice and who last changed it, for the pages that show it (124); hidden until root sets one. */
export const notice = async (
  deps: SettingsDeps,
): Promise<Notice & { changedAt: Date | null; changedBy: string | null }> => {
  const stored = await deps.repo.get(NOTICE_KEY);
  const read = stored ? noticeFromStored(stored.value) : null;
  if (!stored || !read) return { ...DEFAULT_NOTICE, changedAt: null, changedBy: null };
  return { ...read, changedAt: stored.updatedAt, changedBy: stored.updatedBy };
};

const withChangedByName = async (
  deps: SettingsDeps,
  current: Awaited<ReturnType<typeof notice>>,
) => ({
  ...current,
  changedByName: current.changedBy ? await deps.repo.nameOf(current.changedBy) : null,
});

export type InstanceSettings = {
  usagePolicy: UsagePolicy;
  /** When root last changed it, or null while it's the default. */
  usagePolicyChangedAt: Date | null;
  usageMinimum: number;
  twoFactorPolicy: TwoFactorPolicy;
  passwordSignInPolicy: PasswordSignInPolicy;
  retention: RetentionPolicy;
  /** With the name of whoever saved it last, for the Notice tab. */
  notice: Awaited<ReturnType<typeof notice>> & { changedByName: string | null };
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
    notice: await withChangedByName(deps, await notice(deps)),
  };
};

/**
 * Root sets how long personal data is kept (102): the numbers at once, each a whole number of
 * days from 1 to 3,650, audited as `settings.retention` with the old and new values. The next
 * purge runs by the new values; nothing is purged here. `feedbackDays` (127), when left out,
 * stays as it is.
 */
export const setRetention = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: { ipDays: unknown; sessionsDays: unknown; feedbackDays?: unknown },
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const ipDays = retentionDaysFrom(value.ipDays);
  if (ipDays === null) throw new InvalidRetentionError("ipDays");
  const sessionsDays = retentionDaysFrom(value.sessionsDays);
  if (sessionsDays === null) throw new InvalidRetentionError("sessionsDays");
  const askedFeedbackDays =
    value.feedbackDays === undefined ? undefined : retentionDaysFrom(value.feedbackDays);
  if (askedFeedbackDays === null) throw new InvalidRetentionError("feedbackDays");
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const from = await retentionPolicy({ repo });
    const feedbackDays = askedFeedbackDays ?? from.feedbackDays;
    if (
      from.ipDays === ipDays &&
      from.sessionsDays === sessionsDays &&
      from.feedbackDays === feedbackDays
    )
      return { changed: false };
    const by = actor.user?.id ?? null;
    await repo.set(RETENTION_IP_DAYS_KEY, String(ipDays), by, at);
    await repo.set(RETENTION_SESSIONS_DAYS_KEY, String(sessionsDays), by, at);
    await repo.set(RETENTION_FEEDBACK_DAYS_KEY, String(feedbackDays), by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.retention",
        target: { type: "instance" },
        metadata: { from: { ...from }, to: { ipDays, sessionsDays, feedbackDays } },
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

/**
 * Root sets the instance notice (124). The revision rises when the message, link or tone changes,
 * so people who dismissed the old one see the new one; showing or hiding alone keeps it. Audited as
 * `settings.notice` with the old and new tone and whether it is shown, never the text.
 */
export const setNotice = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  input: NoticeInput,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const checked = noticeFrom(input);
  if (!checked.ok) throw new InvalidNoticeError(checked.refusal.field, checked.refusal.problem);
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const from = await notice({ repo });
    const to = checked.notice;
    const contentChanged = noticeContentChanged(from, to);
    if (!contentChanged && from.shown === to.shown) return { changed: false };
    const revision = contentChanged ? from.revision + 1 : from.revision;
    await repo.set(NOTICE_KEY, JSON.stringify({ ...to, revision }), actor.user?.id ?? null, at);
    await repo.recordAudit(
      {
        actorId: actor.user?.id ?? null,
        action: "settings.notice",
        target: { type: "instance" },
        metadata: {
          from: { tone: from.tone, shown: from.shown },
          to: { tone: to.tone, shown: to.shown },
          revision,
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};

/**
 * Admin › Settings › Security scan (135): root's policy, what the operator set up (`scanner`: a
 * command or not, and the provider's name, model and host, never a key), and what the scanner said
 * last.
 */
export const skillScanSettings = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  scanner: SkillScanner,
): Promise<SkillScanSettings> => {
  requirePermission(actor.user, "settings.manage");
  const [policy, version, error] = await Promise.all([
    skillScanPolicy(deps),
    deps.repo.get(SKILL_SCAN_LAST_VERSION_KEY),
    deps.repo.get(SKILL_SCAN_LAST_ERROR_KEY),
  ]);
  return {
    policy,
    scanner,
    lastVersion: version?.value || null,
    lastError: error?.value || null,
    // Semantic chosen while the provider is gone: scans run static, and the page says so.
    runsStatic: policy.analysis === "semantic" && scanner.provider === null,
  };
};

/**
 * Root sets the security scan (135): on or off, the item types, static or semantic. Turning it on
 * needs the operator's command; choosing semantic needs the operator's provider. Audited as
 * `settings.skill_scan` with the old and new policy.
 */
export const setSkillScanPolicy = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  value: { enabled: unknown; types: unknown; analysis: unknown },
  scanner: SkillScanner,
): Promise<{ changed: boolean }> => {
  requirePermission(actor.user, "settings.manage");
  const enabled = value.enabled === true || value.enabled === "on" || value.enabled === "true";
  const types =
    Array.isArray(value.types) && value.types.every((type) => typeof type === "string")
      ? skillScanTypesFrom(value.types)
      : null;
  if (!types) throw new InvalidSkillScanTypesError();
  if (!isSkillScanAnalysis(value.analysis)) throw new InvalidSkillScanAnalysisError();
  const analysis = value.analysis;
  const to: SkillScanPolicy = { enabled, types, analysis };
  const at = now(deps);
  return deps.repo.transaction(async (repo) => {
    const from = await skillScanPolicy({ repo });
    // Turning scanning on needs the command. Keeping it on once the command went is allowed, so
    // root can still change the types (the waiting scans fail `not configured` meanwhile).
    if (enabled && !scanner.configured && !from.enabled) throw new SkillScanNotConfiguredError();
    // Choosing semantic needs a provider. Keeping it once the provider went is allowed, so root
    // can still turn scanning off or change the types (scans run static meanwhile).
    if (analysis === "semantic" && !scanner.provider && from.analysis !== "semantic")
      throw new SkillScanNoProviderError();
    if (
      from.enabled === to.enabled &&
      from.analysis === to.analysis &&
      from.types.join(",") === to.types.join(",")
    )
      return { changed: false };
    const by = actor.user?.id ?? null;
    await repo.set(SKILL_SCAN_ENABLED_KEY, String(to.enabled), by, at);
    await repo.set(SKILL_SCAN_TYPES_KEY, to.types.join(","), by, at);
    await repo.set(SKILL_SCAN_ANALYSIS_KEY, to.analysis, by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.skill_scan",
        target: { type: "instance" },
        metadata: { from, to },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true };
  });
};
