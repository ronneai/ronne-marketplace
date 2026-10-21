import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  type Locale,
} from "@/server/domains/identity/models/locale";

/**
 * Which language a request is shown in (feature 129). A person's language is theirs, not a page's:
 * no URL carries it, and the same link looks the same to everyone. First match wins:
 *
 * 1. the signed-in person's saved language (`user.locale`);
 * 2. the `ronne-locale` cookie, set when someone chooses a language (also before signing in);
 * 3. the browser's `Accept-Language`, the best match among the supported languages;
 * 4. English.
 */
export const LOCALE_COOKIE = "ronne-locale";

export const localeCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
};

/** Header values longer than this, and ranges past the 20th, are ignored: nobody sends more. */
const MAX_HEADER_LENGTH = 1000;
const MAX_RANGES = 20;

/** A cookie value is a preference, not trust: only the supported codes count. */
export const parseLocale = (value: string | null | undefined): Locale | null => {
  return isLocale(value) ? value : null;
};

/** `q=0.8` → 0.8; no weight → 1; anything that isn't a weight from 0 to 1 → null (ignored). */
const weightOf = (parameters: string[]): number | null => {
  const weight = parameters.map((p) => p.trim()).find((p) => p.toLowerCase().startsWith("q="));
  if (weight === undefined) return 1;
  const number = weight.slice(2);
  // At most three decimals, as RFC 9110 allows.
  if (!/^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(number)) return null;
  return Number(number);
};

/**
 * The best supported language in an `Accept-Language` header, or null. Only the primary subtag
 * counts: `pt-PT` and `pt-BR` are `pt`, `fr-CA` is `fr`, `en-GB` is `en`. Higher weights come
 * first, equal ones in the order written; `q=0` means "not acceptable"; `*` and unsupported
 * languages are skipped, so `es, fr;q=0.5` is French.
 */
export const matchAcceptLanguage = (header: string | null | undefined): Locale | null => {
  if (!header || header.length > MAX_HEADER_LENGTH) return null;
  const ranges = header
    .split(",")
    .slice(0, MAX_RANGES)
    .flatMap((part, order) => {
      const [tag = "", ...parameters] = part.split(";");
      const weight = weightOf(parameters);
      const primary = tag.trim().toLowerCase().split("-")[0] ?? "";
      if (weight === null || weight === 0 || !isLocale(primary)) return [];
      return [{ locale: primary, weight, order }];
    })
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  return ranges[0]?.locale ?? null;
};

export type LocaleInputs = {
  /** `user.locale` of the signed-in person; null or absent is automatic. */
  saved?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
};

/** The language for a request: saved, cookie, browser, English. */
export const chooseLocale = (inputs: LocaleInputs): Locale => {
  return (
    parseLocale(inputs.saved) ??
    parseLocale(inputs.cookie) ??
    matchAcceptLanguage(inputs.acceptLanguage) ??
    DEFAULT_LOCALE
  );
};

export { DEFAULT_LOCALE, LOCALES, type Locale };
