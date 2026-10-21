import { vi } from "vitest";
import { type Catalogue, mergeWithFallback } from "@/i18n/catalogue";
import { NAMESPACES } from "@/i18n/namespaces";
import { LOCALES } from "@/server/domains/identity/models/locale";
import { testLocale } from "./intl";

/**
 * Component tests have no Next.js request and no provider, so next-intl's hooks are stood in for
 * here with its own translator and formatter over the real message files (feature 129). Tests
 * render in English, so their assertions keep reading as the screen does; a test of another
 * language wraps its render in `inLocale("pt", …)`.
 */
// The files are read here, not through `loadMessages`: that module takes the logger, which a test
// of the loader replaces, and a module a setup file imports is the one that test would get.
const read = async (locale: string, namespace: string): Promise<Catalogue> =>
  (await import(`../../messages/${locale}/${namespace}.json`)).default;
const all = Object.fromEntries(
  await Promise.all(
    LOCALES.map(async (locale) => {
      const messages: Record<string, Catalogue> = {};
      for (const namespace of NAMESPACES)
        messages[namespace] = mergeWithFallback(
          await read("en", namespace),
          await read(locale, namespace),
        );
      return [locale, messages];
    }),
  ),
);

vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const translator = (namespace?: string) =>
    actual.createTranslator({
      locale: testLocale(),
      messages: all[testLocale()],
      namespace: namespace as never,
    });
  return {
    ...actual,
    useTranslations: translator,
    useLocale: () => testLocale(),
    useFormatter: () => actual.createFormatter({ locale: testLocale() }),
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  };
});

vi.mock("next-intl/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl/server")>();
  const next = await import("next-intl");
  return {
    ...actual,
    getTranslations: async (namespace?: string | { namespace?: string }) =>
      next.createTranslator({
        locale: testLocale(),
        messages: all[testLocale()],
        namespace: (typeof namespace === "string" ? namespace : namespace?.namespace) as never,
      }),
    getLocale: async () => testLocale(),
    getFormatter: async () => next.createFormatter({ locale: testLocale() }),
  };
});
