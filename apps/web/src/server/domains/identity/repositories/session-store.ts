/** A session as the services see it: never its token. */
export type SessionRef = { userId: string; sessionId: string };

/** What the session services need from the auth library. Implemented with Better Auth in better-auth-session-store.ts. */
export interface SessionStore {
  /** The request's session, or null when there's no valid session. */
  currentSession(headers: Headers): Promise<SessionRef | null>;
  /**
   * Checks the password and starts a session. Returns the response headers (with Set-Cookie) and
   * the new session, or null when the email and password don't match an active user.
   */
  signIn(
    headers: Headers,
    credentials: { email: string; password: string; rememberMe: boolean },
  ): Promise<{ headers: Headers; session: SessionRef } | null>;
  /** Ends the request's session. */
  signOut(headers: Headers): Promise<void>;
  /**
   * Changes the password of the request's user and ends their other sessions. Returns false when
   * the current password is wrong.
   */
  changePassword(headers: Headers, current: string, next: string): Promise<boolean>;
}
