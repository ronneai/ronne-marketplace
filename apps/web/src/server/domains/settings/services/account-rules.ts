import { requirePermission } from "../../identity/models/permissions";
import {
  InvalidBlockedDomainError,
  StaleAccountRulesError,
  TooManyBlockedDomainsError,
} from "../exceptions/errors";
import {
  ACCOUNT_RULES_KEYS,
  type AccountRules,
  accountRulesFromRows,
  accountRulesRows,
  MAX_BLOCKED_DOMAINS,
  normalizeBlockedDomain,
  parseBlockedDomains,
} from "../models/account-rules";
import type { SettingsRepository } from "../repositories/settings-repository";
import type { SettingsActor, SettingsDeps } from "./settings";

/**
 * Who may create accounts (191), as stored: no permission check, since every way in reads it
 * before it creates an account.
 */
export const readAccountRules = async (repo: SettingsRepository): Promise<AccountRules> => {
  const keys = Object.entries(ACCOUNT_RULES_KEYS) as [keyof typeof ACCOUNT_RULES_KEYS, string][];
  const rows = await Promise.all(keys.map(([, key]) => repo.get(key)));
  return accountRulesFromRows(
    Object.fromEntries(keys.map(([name], i) => [name, rows[i]?.value ?? null])),
  );
};

/** The *Who may create accounts* panel (191): root only. */
export const accountRulesSettings = async (
  deps: SettingsDeps,
  actor: SettingsActor,
): Promise<AccountRules> => {
  requirePermission(actor.user, "settings.manage");
  return readAccountRules(deps.repo);
};

export type AccountRulesInput = {
  /** The block list as typed: commas, semicolons, spaces or lines between entries. */
  blockedDomains?: unknown;
  blockThrowaway?: unknown;
  /** The version the form was opened with: a save over a newer one is refused as stale. */
  version?: unknown;
};

/**
 * Root saves the block list and the throwaway setting (191). Each entry is lowercased, its `@`
 * and final dot dropped, and refused unless it's a plain ASCII host name; at most 1,000. The form
 * carries the version it was opened with: if anyone saved since, nothing is saved
 * (`StaleAccountRulesError`). Only a change is saved, with a new version, and audited as
 * `settings.account_rules_changed` with the old and new rules.
 */
export const setAccountRules = async (
  deps: SettingsDeps,
  actor: SettingsActor,
  input: AccountRulesInput,
): Promise<{ changed: boolean; version: number }> => {
  requirePermission(actor.user, "settings.manage");
  const parsed = parseBlockedDomains(
    typeof input.blockedDomains === "string" ? input.blockedDomains : "",
  );
  if (!parsed.ok)
    throw normalizeBlockedDomain(parsed.invalid) === null
      ? new InvalidBlockedDomainError(parsed.invalid)
      : new TooManyBlockedDomainsError(MAX_BLOCKED_DOMAINS);
  const blockThrowaway = input.blockThrowaway === true || input.blockThrowaway === "on";
  const expected = Number(input.version);
  const at = (deps.now ?? (() => new Date()))();
  return deps.repo.transaction(async (repo) => {
    const from = await readAccountRules(repo);
    if (!Number.isSafeInteger(expected) || expected !== from.version)
      throw new StaleAccountRulesError();
    const to = { blockedDomains: parsed.domains, blockThrowaway, version: from.version + 1 };
    const same =
      !from.damaged &&
      from.blockThrowaway === to.blockThrowaway &&
      JSON.stringify(from.blockedDomains) === JSON.stringify(to.blockedDomains);
    if (same) return { changed: false, version: from.version };
    const by = actor.user?.id ?? null;
    // The version first, only if it's still the one read: of two saves of one form, one lands.
    const stored = await repo.get(ACCOUNT_RULES_KEYS.version);
    if (
      !(await repo.compareAndSet(
        ACCOUNT_RULES_KEYS.version,
        stored?.value ?? null,
        String(to.version),
        by,
        at,
      ))
    )
      throw new StaleAccountRulesError();
    const rows = accountRulesRows(to);
    for (const [key, value] of Object.entries(rows))
      if (key !== ACCOUNT_RULES_KEYS.version) await repo.set(key, value, by, at);
    await repo.recordAudit(
      {
        actorId: by,
        action: "settings.account_rules_changed",
        target: { type: "instance" },
        metadata: {
          from: { blockedDomains: from.blockedDomains, blockThrowaway: from.blockThrowaway },
          to: { blockedDomains: to.blockedDomains, blockThrowaway: to.blockThrowaway },
        },
        ipAddress: actor.ip,
      },
      at,
    );
    return { changed: true, version: to.version };
  });
};
