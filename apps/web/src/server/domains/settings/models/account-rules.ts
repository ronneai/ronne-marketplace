import { deliveryDomain } from "../../identity/models/sign-up-guard";
import { SIGN_UP_KEYS } from "./sign-up-policy";

/**
 * Who may create accounts (191), rows of `instance_settings`: the block list every way in obeys,
 * and its version for the stale check. A key that isn't there reads as its default (an empty list,
 * version 0), so nothing is written until root saves. The throwaway setting is 190's key, read
 * here because it now applies to every way in with *Any domain*.
 */
export const ACCOUNT_RULES_KEYS = {
  /** JSON: a list of domains. */
  blockedDomains: "blocked_domains",
  /** A whole number, moved by every save; a form with an older one is stale. */
  version: "account_rules_version",
  blockThrowaway: SIGN_UP_KEYS.blockThrowaway,
} as const;

export type AccountRules = {
  blockedDomains: string[];
  /**
   * The stored list couldn't be read. It then blocks every domain, so a damaged list never lets in
   * a domain root kept out; root sees it and saves the list again.
   */
  damaged: boolean;
  blockThrowaway: boolean;
  version: number;
};

export const DEFAULT_ACCOUNT_RULES: AccountRules = {
  blockedDomains: [],
  damaged: false,
  blockThrowaway: true,
  version: 0,
};

/** At most this many domains on the block list. */
export const MAX_BLOCKED_DOMAINS = 1000;

const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const HOST_NAME = new RegExp(`^(?=.{3,253}$)${LABEL}(?:\\.${LABEL})+$`);

/**
 * A domain as root typed it, as the block list keeps it: trimmed, without a leading `@`,
 * lowercased, without its final dot (`@ACME.COM.` is `acme.com`). Null when it isn't plain ASCII
 * (an internationalised domain is typed as `xn--…`, so the list shows what it matches) or isn't a
 * valid host name: one label (`localhost`), a wildcard, an address, or a last label of digits.
 */
export const normalizeBlockedDomain = (typed: string): string | null => {
  if (typed.length > 300) return null;
  const trimmed = typed.trim();
  // Before lowercasing, which folds some non-ASCII letters into ASCII ones (the Kelvin sign).
  if ([...trimmed].some((c) => (c.codePointAt(0) ?? 0) > 0x7e)) return null;
  const domain = trimmed.replace(/^@/, "").toLowerCase().replace(/\.$/, "");
  if (!HOST_NAME.test(domain)) return null;
  if (/^\d+$/.test(domain.slice(domain.lastIndexOf(".") + 1))) return null;
  return domain;
};

export type ParsedBlockedDomains = { ok: true; domains: string[] } | { ok: false; invalid: string };

/**
 * The block list root typed (commas, semicolons, spaces or lines between entries), each entry
 * normalised and kept once, in the order typed. The first entry that isn't a domain refuses the
 * whole list, and so do more than {@link MAX_BLOCKED_DOMAINS}.
 */
export const parseBlockedDomains = (text: string): ParsedBlockedDomains => {
  const typed = text.split(/[\s,;]+/).filter((entry) => entry !== "");
  const domains: string[] = [];
  for (const entry of typed) {
    const domain = normalizeBlockedDomain(entry);
    if (domain === null) return { ok: false, invalid: entry };
    if (!domains.includes(domain)) domains.push(domain);
  }
  if (domains.length > MAX_BLOCKED_DOMAINS)
    return { ok: false, invalid: domains[MAX_BLOCKED_DOMAINS] ?? "" };
  return { ok: true, domains };
};

/**
 * An email's domain as the rules compare it: the part after the last `@`, as mail delivery reads
 * it (IDNA, lowercased, without trailing dots), so `ana@ACME.com.` and `ana@acme.com` are one
 * domain, and a non-ASCII one meets its `xn--` entry. "" when there's none.
 */
export const emailDomain = (email: string): string => {
  const address = email.trim();
  const at = address.lastIndexOf("@");
  return at < 1 ? "" : deliveryDomain(address.slice(at + 1));
};

/**
 * Whether the block list keeps an email out: its domain is listed, compared exactly
 * (`example.com` doesn't cover `eu.example.com`). A damaged list, or an email with no domain,
 * keeps it out too.
 */
export const isDomainBlocked = (
  rules: Pick<AccountRules, "blockedDomains" | "damaged">,
  email: string,
): boolean => {
  if (rules.damaged) return true;
  const domain = emailDomain(email);
  return domain === "" || rules.blockedDomains.includes(domain);
};

const blockedFrom = (value: string | null | undefined): { list: string[]; damaged: boolean } => {
  if (value === null || value === undefined) return { list: [], damaged: false };
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((d) => typeof d === "string")) {
      const list = parsed.map(normalizeBlockedDomain);
      if (list.every((d): d is string => d !== null)) return { list, damaged: false };
    }
  } catch {
    // Unreadable: damaged, below.
  }
  return { list: [], damaged: true };
};

/** The rules from the stored strings; anything absent is its default. */
export const accountRulesFromRows = (
  rows: Partial<Record<keyof typeof ACCOUNT_RULES_KEYS, string | null>>,
): AccountRules => {
  const blocked = blockedFrom(rows.blockedDomains);
  const version = Number(rows.version ?? "0");
  return {
    blockedDomains: blocked.list,
    damaged: blocked.damaged,
    blockThrowaway:
      rows.blockThrowaway === "off"
        ? false
        : rows.blockThrowaway === "on"
          ? true
          : DEFAULT_ACCOUNT_RULES.blockThrowaway,
    version: Number.isSafeInteger(version) && version >= 0 ? version : 0,
  };
};

/** The rules as stored: one string per key. */
export const accountRulesRows = (
  rules: Pick<AccountRules, "blockedDomains" | "blockThrowaway" | "version">,
): Record<string, string> => ({
  [ACCOUNT_RULES_KEYS.blockedDomains]: JSON.stringify(rules.blockedDomains),
  [ACCOUNT_RULES_KEYS.version]: String(rules.version),
  [ACCOUNT_RULES_KEYS.blockThrowaway]: rules.blockThrowaway ? "on" : "off",
});
