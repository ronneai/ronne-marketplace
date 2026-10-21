import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";
import { chooseLocale, LOCALE_COOKIE, type Locale } from "./locale";

/**
 * The language of this request (feature 129), worked out once per request however many layouts and
 * components ask. Before setup, or when the database doesn't answer, there is no saved language:
 * the cookie and the browser decide, so the setup and error screens still speak the person's.
 */
export const requestLocale = cache(async (): Promise<Locale> => {
  let saved: string | null = null;
  try {
    saved = (await getCurrentUser(await requestHeaders()))?.locale ?? null;
  } catch {
    // No session to read: not set up yet, or the database is down.
  }
  return chooseLocale({
    saved,
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
  });
});
