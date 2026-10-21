/**
 * Which pages need a session, and where sign-in sends people afterwards. Plain code with no
 * dependencies, so `src/proxy.ts` can use it (the Next.js docs warn against heavy imports there).
 */

/** The request header `src/proxy.ts` sets to the requested path and query, for `requireUser`. */
export const PATH_HEADER = "x-ronne-path";

export const SIGN_IN_PATH = "/sign-in";
/** The web setup (feature 036): the only page until the instance is ready. */
export const SETUP_PATH = "/setup";
/** Where the language switch's links go (feature 129): sets the cookie and comes back. */
export const LANGUAGE_PATH = "/language";

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * Pages anyone can open. API routes and static files never reach the proxy (see its matcher):
 * `/api/*` answers with its own status codes instead of redirecting.
 */
export const isPublicPath = (pathname: string): boolean => {
  return (
    under(pathname, SIGN_IN_PATH) || under(pathname, SETUP_PATH) || under(pathname, LANGUAGE_PATH)
  );
};

const ORIGIN = "http://ronne.invalid";

/**
 * A path on this site, parsed, or null. It must start with a single `/`, so `//evil.test`,
 * `https://evil.test` and `/\evil.test` can't send anyone off-site.
 */
const sameSite = (value: string | null | undefined): URL | null => {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  let url: URL;
  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }
  // The URL parser drops tabs and newlines, so "/\t/evil.test" becomes "//evil.test": check again.
  // It also resolves dot-segments, so "/a/..//evil.test" (and "/%2e%2e//evil.test") comes out as
  // the path "//evil.test", which a browser reads as another site: refuse a path that starts so.
  if (url.origin !== ORIGIN || url.pathname.startsWith("//")) return null;
  return url;
};

const pathOf = (url: URL) => `${url.pathname}${url.search}${url.hash}`;

/**
 * `next` from the query, if it's a path on this site; otherwise `/`. It never points at a public
 * page (sign-in, setup, the language route): coming back from sign-in to sign-in makes no sense.
 */
export const safeNextPath = (value: string | null | undefined): string => {
  const url = sameSite(value);
  return !url || isPublicPath(url.pathname) ? "/" : pathOf(url);
};

/**
 * Where the language switch comes back to (feature 129): any path on this site, the public pages
 * included, since the switch lives on them; never the language route itself, which would loop.
 */
export const safeBackPath = (value: string | null | undefined): string => {
  const url = sameSite(value);
  return !url || under(url.pathname, LANGUAGE_PATH) ? "/" : pathOf(url);
};

/** The sign-in URL that comes back to `path` afterwards. */
export const signInUrl = (path: string): string => {
  const next = safeNextPath(path);
  return next === "/" ? SIGN_IN_PATH : `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
};

/** The server-action body limit in next.config.ts: a full 20 MB draft, as base64, fits. */
export const LARGE_BODY_LIMIT = 28 * 1024 * 1024;
/** Every other request keeps Next.js's default. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * Whether the proxy refuses a request for its size, before Next.js reads the body. Large bodies are
 * only for the draft editor (saves and .zip imports, feature 012), and only with a session cookie,
 * so no one can send 28 MB to sign-in. The action still checks the session and the draft's owner.
 */
export const bodyTooLarge = (request: {
  method: string;
  pathname: string;
  contentLength: number | null;
  hasSession: boolean;
}): boolean => {
  if (request.method !== "POST" || request.contentLength === null) return false;
  const limit =
    request.hasSession && request.pathname.startsWith("/submissions/")
      ? LARGE_BODY_LIMIT
      : DEFAULT_BODY_LIMIT;
  return request.contentLength > limit;
};
