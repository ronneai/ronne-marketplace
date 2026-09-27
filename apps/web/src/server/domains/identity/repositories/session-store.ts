/** What the session services need from the auth library. Implemented with Better Auth in better-auth-session-store.ts. */
export interface SessionStore {
  /** The user id of the request's session, or null when there's no valid session. */
  sessionUserId(headers: Headers): Promise<string | null>;
  /**
   * Checks the password and starts a session. Returns the response headers (with Set-Cookie), or
   * null when the email and password don't match an active user.
   */
  signIn(
    headers: Headers,
    credentials: { email: string; password: string; rememberMe: boolean },
  ): Promise<Headers | null>;
  /** Ends the request's session. */
  signOut(headers: Headers): Promise<void>;
  /**
   * Changes the password of the request's user and ends their other sessions. Returns false when
   * the current password is wrong.
   */
  changePassword(headers: Headers, current: string, next: string): Promise<boolean>;
}
