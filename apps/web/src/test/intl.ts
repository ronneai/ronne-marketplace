import type { Locale } from "@/server/domains/identity/models/locale";

/**
 * The language component tests render in (feature 129). English unless a test asks for another
 * with `inLocale`; `intl-setup.ts` makes next-intl's hooks read it.
 */
const KEY = "__ronneTestLocale";

export const testLocale = (): Locale =>
  ((globalThis as Record<string, unknown>)[KEY] as Locale | undefined) ?? "en";

/** Runs `render` (synchronously) with every message read in `locale`. */
export const inLocale = <T>(locale: Locale, render: () => T): T => {
  const before = testLocale();
  (globalThis as Record<string, unknown>)[KEY] = locale;
  try {
    return render();
  } finally {
    (globalThis as Record<string, unknown>)[KEY] = before;
  }
};
