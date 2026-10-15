import { type NextRequest, NextResponse } from "next/server";
import {
  bodyTooLarge,
  isPublicPath,
  PATH_HEADER,
  signInUrl,
} from "@/server/domains/identity/models/route-guard";
import { hasSessionCookie } from "@/server/domains/identity/models/session-cookie";
import { REQUEST_ID_HEADER, requestIdFor, trustsProxy } from "@/server/http/request-id";

/**
 * The first, cheap check (feature 006): a page without a session cookie redirects to sign-in. It
 * doesn't check that the session is valid; the (app) layout does that with `requireUser`, which
 * reads the path this sets in PATH_HEADER to come back to it. It also refuses large bodies outside
 * the draft editor (`bodyTooLarge`). And it gives each page request and server action its ID
 * (feature 100): set on the request, replacing one the client sent unless TRUST_PROXY allows it,
 * so the action and `onRequestError` find it, and on the response, for someone to quote.
 */
export const proxy = (request: NextRequest) => {
  const { pathname, search } = request.nextUrl;
  const requestId = requestIdFor(request.headers, trustsProxy());
  const answer = (response: NextResponse) => {
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  };
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
    return answer(new NextResponse("Request body too large.", { status: 413 }));
  if (!isPublicPath(pathname) && !hasSession) {
    return answer(NextResponse.redirect(new URL(signInUrl(`${pathname}${search}`), request.url)));
  }
  const headers = new Headers(request.headers);
  headers.set(PATH_HEADER, `${pathname}${search}`);
  headers.set(REQUEST_ID_HEADER, requestId);
  return answer(NextResponse.next({ request: { headers } }));
};

export const config = {
  // Everything except the API (it answers 401 itself), Next's assets and the icons.
  matcher: ["/((?!api/|_next/static/|_next/image/|icon\\.svg$|icon\\.png$|favicon\\.ico$).*)"],
};
