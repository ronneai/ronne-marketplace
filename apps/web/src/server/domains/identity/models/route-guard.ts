/**
 * Which pages need a session, and where sign-in sends people afterwards. Plain code with no
 * dependencies, so `src/proxy.ts` can use it (the Next.js docs warn against heavy imports there).
 */

/** The request header `src/proxy.ts` sets to the requested path and query, for `requireUser`. */
export const PATH_HEADER = "x-ronne-path";

export const SIGN_IN_PATH = "/sign-in";

/**
 * Pages anyone can open. API routes and static files never reach the proxy (see its matcher):
 * `/api/*` answers with its own status codes instead of redirecting.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === SIGN_IN_PATH || pathname.startsWith(`${SIGN_IN_PATH}/`);
}

const ORIGIN = "http://ronne.invalid";

/**
 * `next` from the query, if it's a path on this site; otherwise `/`. It must start with a single
 * `/`, so `//evil.test`, `https://evil.test` and `/\evil.test` can't send anyone off-site, and it
 * never points back at sign-in.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\"))
    return "/";
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return "/";
  }
  // The URL parser drops tabs and newlines, so "/\t/evil.test" becomes "//evil.test": check again.
  if (url.origin !== ORIGIN || isPublicPath(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The sign-in URL that comes back to `path` afterwards. */
export function signInUrl(path: string): string {
  const next = safeNextPath(path);
  return next === "/" ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}
