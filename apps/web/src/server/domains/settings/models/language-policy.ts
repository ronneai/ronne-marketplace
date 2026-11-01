import { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from "../../identity/models/locale";

/**
 * Which languages the screens speak on this instance (feature 141), as root sets them: the default
 * everyone starts in, whether people may choose their own, and which languages are offered while
 * they may. Rows of `instance_settings`, no migration.
 */
export const LANGUAGE_KEYS = {
  default: "language_default",
  /** `on` or `off`. */
  choice: "language_choice",
  /** A JSON list of language codes. */
  offered: "language_offered",
} as const;

export type LanguagePolicy = {
  /** What everyone sees when choosing is off, and the last step when it is on. */
  default: Locale;
  /** Root's switch. Read `choosing` for what happens: with no other language offered it is off. */
  choice: boolean;
  /** The languages offered, in the app's order; always holds the default. */
  offered: Locale[];
};

export const DEFAULT_LANGUAGE_POLICY: LanguagePolicy = {
  default: DEFAULT_LOCALE,
  choice: true,
  offered: [...LOCALES],
};

/** Whether people can choose in practice: the switch is on and a language besides the default is offered. */
export const choosing = (policy: LanguagePolicy): boolean =>
  policy.choice && policy.offered.some((locale) => locale !== policy.default);

/**
 * The policy from what was typed or stored: unknown codes and repeats dropped, the default always
 * offered, the app's order kept. A list that is empty or not a list means every language.
 */
export const languagePolicyFrom = (input: {
  default?: unknown;
  choice?: unknown;
  offered?: unknown;
}): LanguagePolicy => {
  const fallback = isLocale(input.default) ? input.default : DEFAULT_LANGUAGE_POLICY.default;
  const listed = Array.isArray(input.offered) ? input.offered.filter(isLocale) : [];
  const wanted = new Set<Locale>(listed.length > 0 ? listed : LOCALES);
  wanted.add(fallback);
  return {
    default: fallback,
    choice: input.choice === undefined ? true : input.choice === true || input.choice === "on",
    offered: LOCALES.filter((locale) => wanted.has(locale)),
  };
};

/** The policy as stored: three strings. */
export const languagePolicyRows = (policy: LanguagePolicy): Record<string, string> => ({
  [LANGUAGE_KEYS.default]: policy.default,
  [LANGUAGE_KEYS.choice]: policy.choice ? "on" : "off",
  [LANGUAGE_KEYS.offered]: JSON.stringify(policy.offered),
});

/** The policy from the stored strings; a value that doesn't parse reads as its default. */
export const languagePolicyFromRows = (rows: {
  default?: string | null;
  choice?: string | null;
  offered?: string | null;
}): LanguagePolicy => {
  let offered: unknown;
  try {
    offered = rows.offered ? JSON.parse(rows.offered) : undefined;
  } catch {
    offered = undefined;
  }
  return languagePolicyFrom({
    default: rows.default,
    choice: rows.choice === undefined || rows.choice === null ? undefined : rows.choice === "on",
    offered,
  });
};
