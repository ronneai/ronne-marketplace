/** What the sign-in form shows after a failed attempt. The email is kept; the password never is. */
export type SignInFormState = { error?: "invalid_credentials" | "rate_limited"; email?: string };

export const SIGN_IN_ERRORS: Record<NonNullable<SignInFormState["error"]>, string> = {
  // The same text for an unknown email, a wrong password and a disabled user (spec 006).
  invalid_credentials: "Email or password is wrong",
  rate_limited: "Too many attempts, wait a minute",
};

/** Why the sign-in page was opened again from the second step (105), as `?reason=`. */
export const SIGN_IN_AGAIN = {
  expired: "The sign-in took too long, or two-factor was reset. Sign in again.",
  too_many: "Too many wrong codes. Sign in again.",
} as const;
export type SignInAgain = keyof typeof SIGN_IN_AGAIN;

/** What the second step (105) shows after a refused code. */
export type TwoFactorStepState = {
  error?: "wrong_code" | "used" | "locked" | "refused" | "unreadable";
};

export const TWO_FACTOR_STEP_ERRORS: Record<NonNullable<TwoFactorStepState["error"]>, string> = {
  wrong_code: "That code is wrong",
  used: "That code was already used. Wait for the next one from the app.",
  locked: "Too many wrong codes. Try again in 15 minutes.",
  // A disabled account: the same words as a wrong password at the first step (006).
  refused: "Email or password is wrong",
  unreadable: "Your two-factor sign-in can't be read on this server. Ask a root to reset it.",
};

/** Why a sign-in with an identity provider came back to the sign-in page (106), as `?error=`. */
export const SSO_ERRORS = {
  // One answer for a disabled account and for none: it doesn't say which accounts exist (006).
  disabled:
    "You can't sign in here with that account. Ask root to add you, or to allow your email's domain.",
  not_allowed:
    "You can't sign in here with that account. Ask root to add you, or to allow your email's domain.",
  unverified_email:
    "Your identity provider didn't say your email is verified, so you weren't signed in. Ask your administrator.",
  invalid_response:
    "Your identity provider's answer couldn't be checked, so you weren't signed in. Try again.",
  provider_error: "That provider didn't answer. Try again, or use your password.",
  unavailable: "That way of signing in isn't on. Use another, or ask your administrator.",
  expired: "The sign-in took too long, or was started in another browser. Try again.",
  rate_limited: "Too many attempts, wait a minute.",
} as const;
export type SsoErrorCode = keyof typeof SSO_ERRORS;
