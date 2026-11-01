import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { PATH_HEADER, safeBackPath } from "@/server/domains/identity/models/route-guard";
import { languagePolicy } from "@/server/domains/settings/actions/language";
import { choosing, type LanguagePolicy } from "@/server/domains/settings/models/language-policy";
import { requestHeaders } from "@/server/http/request-headers";
import { chooseLocale, LOCALE_COOKIE, LOCALES, type Locale } from "./locale";

/**
 * The languages this instance speaks (141), read once per request. Before setup, or when the
 * database doesn't answer, there are no settings (null): every language is offered and English is
 * the default, as before the settings existed.
 */
export const requestLanguagePolicy = cache(async (): Promise<LanguagePolicy | null> => {
  try {
    return await languagePolicy();
  } catch {
    // Not set up yet, or the database is down.
    return null;
  }
});

/**
 * The languages people may choose among on this instance (141): the offered ones while choosing is
 * on, none while it is off. Every language when the settings can't be read (before setup, database
 * down), as before the settings existed. The switches that let a person choose show only when there
 * is more than one.
 */
export const requestChoosableLocales = cache(async (): Promise<readonly Locale[]> => {
  const policy = await requestLanguagePolicy();
  if (!policy) return LOCALES;
  return choosing(policy) ? policy.offered : [];
});

/**
 * The language of this request (feature 129), worked out once per request however many layouts and
 * components ask. Before setup, or when the database doesn't answer, there is no saved language
 * and no instance policy: the cookie and the browser decide, so the setup and error screens still
 * speak the person's.
 */
export const requestLocale = cache(async (): Promise<Locale> => {
  let saved: string | null = null;
  try {
    saved = (await getCurrentUser(await requestHeaders()))?.locale ?? null;
  } catch {
    // No session to read: not set up yet, or the database is down.
  }
  const policy = await requestLanguagePolicy();
  return chooseLocale({
    saved,
    cookie: (await cookies()).get(LOCALE_COOKIE)?.value,
    acceptLanguage: (await headers()).get("accept-language"),
    instance: policy
      ? { default: policy.default, choosing: choosing(policy), offered: policy.offered }
      : undefined,
  });
});

/** The page being rendered (path and query), for the language switch to come back to. */
export const currentPath = async (): Promise<string> => {
  return safeBackPath((await headers()).get(PATH_HEADER));
};
