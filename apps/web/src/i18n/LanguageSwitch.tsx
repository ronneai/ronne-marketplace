import { useLocale, useTranslations } from "next-intl";
import { LOCALE_NAMES, LOCALES } from "@/server/domains/identity/models/locale";
import { LANGUAGE_PATH, safeBackPath } from "@/server/domains/identity/models/route-guard";

/**
 * The language switch on the pages before sign-in (feature 129): sign-in, its second step and the
 * setup. Each language is a link to `/language`, which sets the cookie and comes back to `here`,
 * so it works without JavaScript. Each is written in its own language, so someone in the wrong one
 * can find theirs. A plain `<a>`, not Next's `Link`: the route sets a cookie, so it must never be
 * prefetched.
 */
export const LanguageSwitch = ({ here = "/" }: { here?: string }) => {
  const t = useTranslations("common.languageSwitch");
  const current = useLocale();
  const back = safeBackPath(here);
  return (
    <nav
      aria-label={t("label")}
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm"
    >
      {LOCALES.map((locale) => (
        <a
          key={locale}
          href={`${LANGUAGE_PATH}?set=${locale}&next=${encodeURIComponent(back)}`}
          lang={locale}
          hrefLang={locale}
          aria-current={locale === current ? "true" : undefined}
          className="touch-hit rounded-control text-link underline-offset-2 outline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-focus aria-[current=true]:font-semibold aria-[current=true]:text-fg aria-[current=true]:no-underline"
        >
          {LOCALE_NAMES[locale]}
        </a>
      ))}
    </nav>
  );
};
