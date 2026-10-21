export type ChangePasswordError =
  | "wrong_password"
  | "too_short"
  | "too_long"
  | "mismatch"
  | "rate_limited";

export type ChangePasswordFormState = { error?: ChangePasswordError; changed?: boolean };

/** Which field an error belongs to, for aria-invalid and the message placement. */
export const ERROR_FIELD: Record<ChangePasswordError, "current" | "next" | "confirm" | null> = {
  wrong_password: "current",
  too_short: "next",
  too_long: "next",
  mismatch: "confirm",
  rate_limited: null,
};

/** What the Language form answers (feature 129): saved (the language, or `automatic`) or refused. */
export type LanguageFormState = { saved?: string; error?: "invalid" };
