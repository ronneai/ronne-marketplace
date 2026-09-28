import { type NextRequest, NextResponse } from "next/server";
import {
  bodyTooLarge,
  isPublicPath,
  PATH_HEADER,
  signInUrl,
} from "@/server/domains/identity/models/route-guard";
import { hasSessionCookie } from "@/server/domains/identity/models/session-cookie";

/**
 * The first, cheap check (feature 006): a page without a session cookie redirects to sign-in. It
 * doesn't check that the session is valid; the (app) layout does that with `requireUser`, which
 * reads the path this sets in PATH_HEADER to come back to it. It also refuses large bodies outside
 * the draft editor (`bodyTooLarge`).
 */
export const proxy = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl;
  const hasSession = hasSessionCookie(request.cookies);
  const length = request.headers.get("content-length");
  if (
    bodyTooLarge({
      method: request.method,
      pathname,
      contentLength: length === null ? null : Number(length),
      hasSession,
    })
  )
    return new NextResponse("Request body too large.", { status: 413 });
  if (!isPublicPath(pathname) && !hasSession) {
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
