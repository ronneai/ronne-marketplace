/** What the sign-in form shows after a failed attempt. The email is kept; the password never is. */
export type SignInFormState = { error?: "invalid_credentials" | "rate_limited"; email?: string };

/**
 * Why the sign-in page was opened again from the second step (105), as `?reason=`. The words are
 * `auth.signIn.again.<code>` in the messages (feature 129); an unknown code says nothing.
 */
export const SIGN_IN_AGAIN = ["expired", "too_many"] as const;
export type SignInAgain = (typeof SIGN_IN_AGAIN)[number];

/** What the second step (105) shows after a refused code (`auth.twoFactor.errors.<code>`). */
export type TwoFactorStepState = {
  error?: "wrong_code" | "used" | "locked" | "refused" | "unreadable";
};

/**
 * Why a sign-in with an identity provider came back to the sign-in page (106), as `?error=`
 * (`auth.signIn.sso.<code>`). One answer for a disabled account and for none: it doesn't say which
 * accounts exist (006).
 */
export const SSO_ERROR_CODES = [
  "disabled",
  "not_allowed",
  "unverified_email",
  "invalid_response",
  "provider_error",
  "unavailable",
  "expired",
  "rate_limited",
] as const;
export type SsoErrorCode = (typeof SSO_ERROR_CODES)[number];
