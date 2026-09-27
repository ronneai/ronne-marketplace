import { type NextRequest, NextResponse } from "next/server";
import { isPublicPath, PATH_HEADER, signInUrl } from "@/server/domains/identity/models/route-guard";
import { hasSessionCookie } from "@/server/domains/identity/models/session-cookie";

/**
 * The first, cheap check (feature 006): a page without a session cookie redirects to sign-in. It
 * doesn't check that the session is valid; the (app) layout does that with `requireUser`, which
 * reads the path this sets in PATH_HEADER to come back to it.
 */
export const proxy = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl;
  if (!isPublicPath(pathname) && !hasSessionCookie(request.cookies)) {
    return NextResponse.redirect(new URL(signInUrl(`${pathname}${search}`), request.url));
  }
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers } });
};

export const config = {
  // Everything except the API (it answers 401 itself), Next's assets and the icons.
  matcher: ["/((?!api/|_next/static/|_next/image/|icon\\.svg$|icon\\.png$|favicon\\.ico$).*)"],
};
