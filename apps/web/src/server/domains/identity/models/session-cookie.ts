/**
 * The session cookie's names. Plain data, so `src/proxy.ts` can check for the cookie without
 * importing Better Auth. Better Auth adds `__Secure-` when PUBLIC_URL is https.
 */
export const COOKIE_PREFIX = "ronne";

export const SESSION_COOKIE_NAMES = [
  `${COOKIE_PREFIX}.session_token`,
  `__Secure-${COOKIE_PREFIX}.session_token`,
] as const;

/** Whether a request carries a session cookie. It says nothing about the session being valid. */
export const hasSessionCookie = (cookies: { has(name: string): boolean }): boolean => {
  return SESSION_COOKIE_NAMES.some((name) => cookies.has(name));
};
