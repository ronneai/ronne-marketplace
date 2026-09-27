/** What the sign-in form shows after a failed attempt. The email is kept; the password never is. */
export type SignInFormState = { error?: "invalid_credentials" | "rate_limited"; email?: string };

export const SIGN_IN_ERRORS: Record<NonNullable<SignInFormState["error"]>, string> = {
  // The same text for an unknown email, a wrong password and a disabled user (spec 006).
  invalid_credentials: "Email or password is wrong",
  rate_limited: "Too many attempts, wait a minute",
};
