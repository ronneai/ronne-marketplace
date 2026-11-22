import { emailCodeMinutes } from "../../identity/models/email-code";
import { deliveryDomain } from "../../identity/models/sign-up-guard";

/**
 * Self-registration's settings (feature 190), rows of `instance_settings`. A key that isn't there
 * reads as its default, so every instance, new or upgraded, starts with sign-up off and nothing
 * is written for it until root saves.
 */
export const SIGN_UP_KEYS = {
  enabled: "sign_up_enabled",
  /** JSON: `"any"`, or a list of domains. */
  domains: "sign_up_domains",
  approval: "sign_up_approval",
  blockThrowaway: "sign_up_block_throwaway",
  /** The code lifetime, in minutes, for every email code (190, 194, 197). */
  codeMinutes: "email_code_minutes",
  challenge: "sign_up_challenge",
  termsUrl: "terms_url",
  termsVersion: "terms_version",
  /** The version everyone must have accepted; it moves only when root asks everyone again. */
  termsRequiredVersion: "terms_required_version",
} as const;

export type SignUpPolicy = {
  enabled: boolean;
  /** `any`, or the domains an address must be in, matched exactly; an empty list lets none in. */
  domains: "any" | string[];
  approval: boolean;
  blockThrowaway: boolean;
  codeMinutes: number;
  challenge: boolean;
  termsUrl: string;
  termsVersion: string;
  termsRequiredVersion: string;
};

/** Sign-up off, any domain, no approval, throwaway domains blocked, 15 minutes, challenge on. */
export const DEFAULT_SIGN_UP_POLICY: SignUpPolicy = {
  enabled: false,
  domains: "any",
  approval: false,
  blockThrowaway: true,
  codeMinutes: 15,
  challenge: true,
  termsUrl: "",
  termsVersion: "",
  termsRequiredVersion: "",
};

const flag = (value: string | null | undefined, fallback: boolean): boolean =>
  value === "on" ? true : value === "off" ? false : fallback;

/**
 * The domains as stored. Nothing stored is the default, any domain; anything stored that isn't
 * `"any"` or a list of domains fails closed: an empty list, which lets no domain in, so a damaged
 * allow list never opens sign-up to every domain.
 */
const domainsFrom = (value: string | null | undefined): "any" | string[] => {
  // Only a key that isn't stored is the default; a stored value, even an empty one, is read.
  if (value === null || value === undefined) return DEFAULT_SIGN_UP_POLICY.domains;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === "any") return "any";
    if (Array.isArray(parsed))
      return parsed.filter((d): d is string => typeof d === "string" && d.trim() !== "");
  } catch {
    // Unreadable: closed, below.
  }
  return [];
};

/** The policy from the stored strings; anything absent or unreadable is its default. */
export const signUpPolicyFromRows = (
  rows: Partial<Record<keyof typeof SIGN_UP_KEYS, string | null>>,
): SignUpPolicy => ({
  enabled: flag(rows.enabled, DEFAULT_SIGN_UP_POLICY.enabled),
  domains: domainsFrom(rows.domains),
  approval: flag(rows.approval, DEFAULT_SIGN_UP_POLICY.approval),
  blockThrowaway: flag(rows.blockThrowaway, DEFAULT_SIGN_UP_POLICY.blockThrowaway),
  codeMinutes: rows.codeMinutes
    ? emailCodeMinutes(rows.codeMinutes)
    : DEFAULT_SIGN_UP_POLICY.codeMinutes,
  challenge: flag(rows.challenge, DEFAULT_SIGN_UP_POLICY.challenge),
  termsUrl: rows.termsUrl ?? "",
  termsVersion: rows.termsVersion ?? "",
  termsRequiredVersion: rows.termsRequiredVersion ?? "",
});

/** The policy as stored: one string per key. */
export const signUpPolicyRows = (policy: SignUpPolicy): Record<string, string> => ({
  [SIGN_UP_KEYS.enabled]: policy.enabled ? "on" : "off",
  [SIGN_UP_KEYS.domains]: JSON.stringify(policy.domains),
  [SIGN_UP_KEYS.approval]: policy.approval ? "on" : "off",
  [SIGN_UP_KEYS.blockThrowaway]: policy.blockThrowaway ? "on" : "off",
  [SIGN_UP_KEYS.codeMinutes]: String(policy.codeMinutes),
  [SIGN_UP_KEYS.challenge]: policy.challenge ? "on" : "off",
  [SIGN_UP_KEYS.termsUrl]: policy.termsUrl,
  [SIGN_UP_KEYS.termsVersion]: policy.termsVersion,
  [SIGN_UP_KEYS.termsRequiredVersion]: policy.termsRequiredVersion,
});

/** At most this many domains in the allow list. */
export const SIGN_UP_MAX_DOMAINS = 100;

/**
 * The domains root typed (commas, spaces or lines between them), each as mail delivery reads it,
 * once each, or null when one isn't a plain domain or there are too many. `*` and the like are
 * refused: a listed domain is compared exactly, never as a pattern.
 */
export const parseSignUpDomains = (text: string): string[] | null => {
  const typed = text.split(/[\s,;]+/).filter((entry) => entry !== "");
  if (typed.length > SIGN_UP_MAX_DOMAINS) return null;
  const domains: string[] = [];
  for (const entry of typed) {
    const domain = deliveryDomain(entry);
    // The last label is a name, never a number: `1.2.3.4` is an address, not a domain.
    if (!PLAIN_DOMAIN.test(domain) || /^\d+$/.test(domain.slice(domain.lastIndexOf(".") + 1)))
      return null;
    if (!domains.includes(domain)) domains.push(domain);
  }
  return domains;
};

const PLAIN_DOMAIN =
  /^(?=.{3,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Whether text has a control character, a space or a line separator (none belong in a link). */
const hasControl = (value: string, spaces: boolean): boolean =>
  [...value].some((ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return (
      code < 0x20 ||
      code === 0x7f ||
      code === 0x2028 ||
      code === 0x2029 ||
      // The bidirectional marks and overrides, which make text read other than it is.
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (spaces && /\s/.test(ch))
    );
  });

/** A terms link root may save: empty, or an absolute https:// address with no user name. */
export const isTermsUrl = (value: string): boolean => {
  if (value === "") return true;
  // Spelled out as typed: `https:acme.com` parses, but isn't what the form shows people.
  if (value.length > 500 || !value.startsWith("https://") || hasControl(value, true)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== ""
    );
  } catch {
    return false;
  }
};

/** A terms version: 1 to 64 characters, no line breaks or control characters. */
export const isTermsVersion = (value: string): boolean =>
  value.length >= 1 && value.length <= 64 && !hasControl(value, false);
