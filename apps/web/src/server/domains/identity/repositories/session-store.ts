/** What the session services need from the auth library. Implemented with Better Auth in better-auth-session-store.ts. */
export interface SessionStore {
  /** The user id of the request's session, or null when there's no valid session. */
  sessionUserId(headers: Headers): Promise<string | null>;
}
