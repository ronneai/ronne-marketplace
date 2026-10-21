/**
 * The languages the web app speaks (feature 129): English, Brazilian Portuguese and Canadian
 * French. The codes are the website's. English is the source of every text and the fallback.
 */
export const LOCALES = ["en", "pt", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const isLocale = (value: unknown): value is Locale => {
  return LOCALES.includes(value as Locale);
};

/** Each language's own name, so someone in the wrong language can find theirs. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  pt: "Português",
  fr: "Français",
};
