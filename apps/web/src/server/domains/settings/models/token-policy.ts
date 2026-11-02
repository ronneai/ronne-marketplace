/**
 * The longest a personal access token may live (feature 162), as root sets it: one cap for
 * everyone, and one for reviewers and root that is the same or shorter. Reviewers are counted as the
 * two-factor policy counts them (`coveredBy` in `identity/models/two-factor-coverage.ts`): root, and
 * moderators and admins of a shared workspace. A cap is 30, 90 or 365 days, or null for no limit.
 */
export const TOKEN_LIFETIMES = [30, 90, 365] as const;
export type TokenLifetime = (typeof TOKEN_LIFETIMES)[number];
/** Days, or null for no limit. */
export type TokenCap = TokenLifetime | null;

export type TokenPolicy = { maxDays: TokenCap; reviewersMaxDays: TokenCap };

/** A new instance's policy (Decision 2): 365 days for everyone, 90 for reviewers and root. */
export const DEFAULT_TOKEN_POLICY: TokenPolicy = { maxDays: 365, reviewersMaxDays: 90 };

/** The settings' keys in `instance_settings`. */
export const TOKEN_MAX_DAYS_KEY = "token_max_days";
export const TOKEN_MAX_DAYS_REVIEWERS_KEY = "token_max_days_reviewers";

/** What `instance_settings` holds for "no limit": a missing key means the default instead. */
export const NO_LIMIT = "none";

const isLifetime = (value: number): value is TokenLifetime =>
  (TOKEN_LIFETIMES as readonly number[]).includes(value);

/**
 * A cap as a form, a request or `instance_settings` gives it: 30, 90 or 365 (a number, or exactly
 * those digits), or `"none"` for no limit. Anything else is undefined, an empty value and null
 * included: a field left out (`FormData.get` gives null) must never mean the loosest policy.
 */
export const tokenCapFrom = (value: unknown): TokenCap | undefined => {
  if (value === NO_LIMIT) return null;
  if (typeof value === "number") return isLifetime(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  return TOKEN_LIFETIMES.find((days) => String(days) === value);
};

/** A cap as `instance_settings` holds it. */
export const storedTokenCap = (cap: TokenCap): string => (cap === null ? NO_LIMIT : String(cap));

/** Whether a cap is no longer than another (null, no limit, is the longest). */
export const capWithin = (cap: TokenCap, limit: TokenCap): boolean =>
  limit === null || (cap !== null && cap <= limit);

/** The shorter of two caps. */
const shorter = (a: TokenCap, b: TokenCap): TokenCap => (capWithin(a, b) ? a : b);

/**
 * The policy from what `instance_settings` holds (null for a key never set). A value that isn't a
 * cap (a hand edit) reads as the default, as the other settings do; and the reviewers' cap never
 * reads longer than everyone's, so a hand edit or a lone key can't make it so.
 */
export const tokenPolicyFrom = (stored: {
  maxDays: string | null;
  reviewersMaxDays: string | null;
}): TokenPolicy => {
  const read = (value: string | null, fallback: TokenCap) => {
    if (value === null) return fallback;
    const cap = tokenCapFrom(value);
    return cap === undefined ? fallback : cap;
  };
  const maxDays = read(stored.maxDays, DEFAULT_TOKEN_POLICY.maxDays);
  const reviewersMaxDays = read(stored.reviewersMaxDays, DEFAULT_TOKEN_POLICY.reviewersMaxDays);
  return { maxDays, reviewersMaxDays: shorter(reviewersMaxDays, maxDays) };
};

/** The cap that applies to a person: the reviewers' one when the two-factor policy counts them. */
export const capFor = (policy: TokenPolicy, reviewer: boolean): TokenCap =>
  reviewer ? policy.reviewersMaxDays : policy.maxDays;
