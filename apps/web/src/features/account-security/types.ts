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
