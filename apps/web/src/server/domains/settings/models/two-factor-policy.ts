/**
 * Who must use two-factor sign-in (feature 105), as root sets it:
 * - `optional`: nobody; people choose (a new instance's default);
 * - `reviewers`: root, and anyone who is moderator or admin of a shared workspace (they approve
 *   what developers install);
 * - `everyone`: every account that signs in with a password.
 * Accounts with no password (company sign-in) are never covered: their provider's second step is.
 */
export const TWO_FACTOR_POLICIES = ["optional", "reviewers", "everyone"] as const;
export type TwoFactorPolicy = (typeof TWO_FACTOR_POLICIES)[number];

export const DEFAULT_TWO_FACTOR_POLICY: TwoFactorPolicy = "optional";

export const isTwoFactorPolicy = (value: unknown): value is TwoFactorPolicy =>
  typeof value === "string" && (TWO_FACTOR_POLICIES as readonly string[]).includes(value);

/** The setting's key in `instance_settings`. */
export const TWO_FACTOR_POLICY_KEY = "two_factor_policy";
