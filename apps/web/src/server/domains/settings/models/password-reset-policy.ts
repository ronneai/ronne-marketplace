/**
 * Forgot password by email's setting (feature 194), a row of `instance_settings`. A key that isn't
 * there reads as off, so every instance, new or upgraded, starts with it off and nothing is
 * written for it until root turns it on.
 */
export const PASSWORD_RESET_KEYS = { enabled: "password_reset_by_email" } as const;

export type PasswordResetPolicy = { enabled: boolean };

export const DEFAULT_PASSWORD_RESET_POLICY: PasswordResetPolicy = { enabled: false };

/** The policy from the stored string: only `on` turns it on, anything else is off. */
export const passwordResetPolicyFromRow = (
  value: string | null | undefined,
): PasswordResetPolicy => ({
  enabled: value === "on",
});

/**
 * What the setting needs before it can be turned on (194): email set up (189), its last test or
 * send having worked, and the instance contact, which every security notice prints (NIST SP
 * 800-63B-4 §4.6).
 */
export type PasswordResetReadiness = { mail: boolean; working: boolean; contact: boolean };

export type PasswordResetBlocker = "mail" | "working" | "contact";

/** What still stands in the way, in the order the panel names it. */
export const passwordResetBlockers = (
  readiness: PasswordResetReadiness,
): PasswordResetBlocker[] => [
  ...(readiness.mail ? [] : (["mail"] as const)),
  ...(readiness.mail && !readiness.working ? (["working"] as const) : []),
  ...(readiness.contact ? [] : (["contact"] as const)),
];
