/** What a two-factor form can be refused with (feature 105), as the services answer. */
export type TwoFactorError =
  | "not_signed_in"
  | "no_password"
  | "wrong_password"
  | "wrong_code"
  | "used"
  | "rate_limited"
  | "already_on"
  | "not_enabled"
  | "another_tab"
  | "replaced"
  | "just_made";

export const TWO_FACTOR_ERRORS: Record<TwoFactorError, string> = {
  not_signed_in: "You were signed out. Sign in again.",
  no_password:
    "Your account has no password here: you sign in through your company, which protects the sign-in.",
  wrong_password: "The password is wrong",
  wrong_code: "That code is wrong. Check the phone's clock if it keeps failing.",
  used: "That code was already used. Wait for the next one from the app.",
  rate_limited: "Too many attempts, wait a minute",
  already_on: "Two-factor sign-in is already on",
  not_enabled: "Two-factor sign-in is off",
  another_tab: "Enrolment was started in another tab. Start again.",
  replaced:
    "This setup was replaced by a newer one, in another tab or by a second click. Start again.",
  just_made: "You just made new backup codes: use those.",
};

/** A setup on its way: what the page shows until the first code is right. */
export type Setup = { uri: string; qrSvg: string; secret: string; backupCodes: string[] };

export type StartState = { error?: TwoFactorError; setup?: Setup };
export type ConfirmState = { error?: TwoFactorError; done?: boolean };
export type RegenerateState = { error?: TwoFactorError; backupCodes?: string[] };
export type TurnOffState = { error?: TwoFactorError; done?: boolean };

/** The secret as people type it: the URI's base32, in groups of four. */
export const secretGroups = (uri: string): string =>
  (URL.canParse(uri) ? (new URL(uri).searchParams.get("secret") ?? "") : "")
    .match(/.{1,4}/g)
    ?.join(" ") ?? "";
