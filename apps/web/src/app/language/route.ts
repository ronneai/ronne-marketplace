import type { NextRequest } from "next/server";
import { LOCALE_COOKIE, localeCookieOptions, parseLocale } from "@/i18n/locale";
import { safeBackPath } from "@/server/domains/identity/models/route-guard";
import { redirectToPath } from "@/server/http/redirect-path";

/**
 * The language switch's links (feature 129): sets the `ronne-locale` cookie and goes back to the
 * page they came from, so they work without JavaScript, signed in or not (a signed-in person's
 * saved language still wins: the switch is on the pages before sign-in). `?set=` is `en`, `pt` or
 * `fr`; anything else changes nothing. `?next=` must be a path on this site. A plain link, never
 * prefetched, since it sets a cookie (docs/knowledge/links-that-change-state.md).
 */
export const GET = (request: NextRequest) => {
  const params = request.nextUrl.searchParams;
  const locale = parseLocale(params.get("set"));
  const response = redirectToPath(safeBackPath(params.get("next")));
  if (locale) response.cookies.set(LOCALE_COOKIE, locale, localeCookieOptions);
  return response;
};
