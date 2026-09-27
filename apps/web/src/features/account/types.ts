export type ChangePasswordError =
  | "wrong_password"
  | "too_short"
  | "too_long"
  | "mismatch"
  | "rate_limited";

export type ChangePasswordFormState = { error?: ChangePasswordError; changed?: boolean };

export const CHANGE_PASSWORD_ERRORS: Record<ChangePasswordError, string> = {
  wrong_password: "The current password is wrong",
  too_short: "The new password needs at least 12 characters",
  too_long: "The new password can have at most 128 characters",
  mismatch: "The new passwords don't match",
  rate_limited: "Too many attempts, wait a minute",
};

/** Which field an error belongs to, for aria-invalid and the message placement. */
export const ERROR_FIELD: Record<ChangePasswordError, "current" | "next" | "confirm" | null> = {
  wrong_password: "current",
  too_short: "next",
  too_long: "next",
  mismatch: "confirm",
  rate_limited: null,
};
