import { emailCodeMinutes } from "../../identity/models/email-code";

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
