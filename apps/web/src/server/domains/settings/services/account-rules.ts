import {
  ACCOUNT_RULES_KEYS,
  type AccountRules,
  accountRulesFromRows,
} from "../models/account-rules";
import type { SettingsRepository } from "../repositories/settings-repository";

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
