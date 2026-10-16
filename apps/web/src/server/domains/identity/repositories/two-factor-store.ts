/** A new TOTP enrolment, as the auth library hands it out once. */
export type TotpEnrolment = { uri: string; backupCodes: string[] };

/** Where a person's two-factor stands. */
export type TwoFactorStatus = { enabled: boolean; backupCodesLeft: number };

/**
 * What the two-factor services need from the auth library (feature 105). Implemented with Better
 * Auth's twoFactor plugin in better-auth-two-factor-store.ts. Every call acts as the request's
 * signed-in user; none of them checks a code at sign-in (that's the sign-in step, task 5). A call
 * whose session ended under it (another tab confirmed or turned off, which replaces the session)
 * answers `signed_out` instead of throwing.
 */
export interface TwoFactorStore {
  status(userId: string): Promise<TwoFactorStatus>;
  /** Whether the password is the user's own (their credential account's). */
  checkPassword(userId: string, password: string): Promise<boolean>;
  /**
   * Starts an enrolment: a new secret and backup codes, not active until `confirm`. `another_tab`
   * when a concurrent enrolment won the unique index.
   */
  begin(
    headers: Headers,
    password: string,
  ): Promise<
    | { ok: true; enrolment: TotpEnrolment }
    | { ok: false; error: "wrong_password" | "already_on" | "another_tab" | "signed_out" }
  >;
  /**
   * The enrolment started and not confirmed yet, as it was handed out (its URI and backup codes),
   * so starting again can show it again; null when there's none. Needs the password.
   */
  pending(
    headers: Headers,
    userId: string,
    password: string,
  ): Promise<TotpEnrolment | null | "signed_out">;
  /** The session that started the user's pending setup, or null (none, or long ago). */
  setupSession(userId: string): Promise<string | null>;
  /** Records the session that started the user's pending setup (it alone sees it again). */
  rememberSetupSession(userId: string, sessionId: string): Promise<void>;
  /**
   * Whether the user's stored secret is the one in this enrolment's URI (not a later request's).
   * False for a URI that isn't one, or names no secret.
   */
  holds(userId: string, uri: string): Promise<boolean>;
  /**
   * Checks the first code and turns two-factor on. Returns the response headers (the library
   * replaces the session), `wrong_code`, or `not_started` when there's no enrolment to confirm.
   */
  confirm(
    headers: Headers,
    code: string,
  ): Promise<Headers | "wrong_code" | "not_started" | "signed_out">;
  /** Whether the code is a right TOTP code, or an unused backup code (which it uses up). */
  checkCode(headers: Headers, code: string): Promise<boolean | "signed_out">;
  /** Ten new backup codes; the old ones stop working. Null for a wrong password. */
  regenerateBackupCodes(
    headers: Headers,
    password: string,
  ): Promise<string[] | null | "signed_out">;
  /** Turns two-factor off and deletes its record. Returns the response headers, or null. */
  disable(headers: Headers, password: string): Promise<Headers | null | "signed_out">;
}
