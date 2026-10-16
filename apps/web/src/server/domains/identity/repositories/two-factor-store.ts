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
  /** Whether two-factor is on, without reading the backup codes: cheap enough for every request. */
  enabled(userId: string): Promise<boolean>;
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
  /**
   * Which kind of right code it is: a TOTP code, or an unused backup code (which it uses up);
   * false for neither.
   */
  checkCode(headers: Headers, code: string): Promise<"totp" | "backup_code" | false | "signed_out">;
  /** Ten new backup codes; the old ones stop working. Null for a wrong password. */
  regenerateBackupCodes(
    headers: Headers,
    password: string,
  ): Promise<string[] | null | "signed_out">;
  /** Turns two-factor off and deletes its record. Returns the response headers, or null. */
  disable(headers: Headers, password: string): Promise<Headers | null | "signed_out">;
  /**
   * Whose sign-in the request's pending challenge (the second step) is, or null without a valid
   * one: the cookie Better Auth reads, its signature checked. It says who to check a code against
   * and who the audit names; the challenge itself is verified by `verifyChallenge`.
   */
  challengeUser(headers: Headers): Promise<string | null>;
  /**
   * The second step at sign-in: a TOTP code or a backup code for the request's challenge. A right
   * one creates the session (Remember me as chosen at the first step).
   */
  verifyChallenge(
    headers: Headers,
    code: string,
    method: "totp" | "backup_code",
  ): Promise<
    | { ok: true; headers: Headers; userId: string; sessionId: string; remember: boolean }
    | { ok: false; error: ChallengeRefusal }
  >;
  /** Whether this TOTP code was already accepted for the user, within the time it stays valid. */
  codeUsed(userId: string, code: string): Promise<boolean>;
  /** Records a TOTP code as accepted; false when it already was (two uses at once). */
  spendCode(userId: string, code: string): Promise<boolean>;
  /** Ends one session (a sign-in that turned out to reuse a code). */
  endSession(sessionId: string): Promise<void>;
}

/** Why the second step refused a code. */
export type ChallengeRefusal =
  /** Not the code. */
  | "wrong_code"
  /** No challenge, or it ran out (10 minutes), or two-factor was reset meanwhile. */
  | "expired"
  /** Five wrong codes in this challenge: it's void, sign in again. */
  | "too_many"
  /** Ten wrong codes in a row: the second step is locked for 15 minutes. */
  | "locked"
  /** The account can't sign in (disabled). */
  | "refused"
  /** The stored secret can't be decrypted with this server's AUTH_SECRET. */
  | "unreadable";
