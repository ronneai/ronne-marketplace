/**
 * The reset flow's cookie (194): 32 random bytes, HttpOnly, SameSite=Strict, sent only to the
 * reset's own pages. Over https it's `__Secure-` and Secure, as the session cookie is; a
 * `__Host-` name would need the whole site as its path, and this one stays on `/sign-in/forgot`.
 * Plain data, no server imports: the pages and the actions both read it.
 */
export const RESET_COOKIE_PATH = "/sign-in/forgot";

/** Its name for this public address. */
export const resetCookieName = (publicUrl: string | undefined): string =>
  (publicUrl ?? "").startsWith("https://") ? "__Secure-ronne.reset" : "ronne.reset";

/** How it's set: the longest a code lives (60 minutes); the flow itself checks its own end. */
export const resetCookieOptions = (publicUrl: string | undefined) => ({
  httpOnly: true,
  sameSite: "strict" as const,
  path: RESET_COOKIE_PATH,
  secure: (publicUrl ?? "").startsWith("https://"),
  maxAge: 60 * 60,
});
