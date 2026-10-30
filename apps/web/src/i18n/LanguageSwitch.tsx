import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Disclosure } from "@/components/ui/Disclosure";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/server/domains/identity/models/locale";
import { LANGUAGE_PATH, safeBackPath } from "@/server/domains/identity/models/route-guard";

/**
 * The language switch on the pages before sign-in (feature 129): sign-in, its second step and the
 * setup. A menu (157), so a fourth language needs no room: it shows the language in use, and opens
 * to the list. Each language is a link to `/language`, which sets the cookie and comes back to `here`,
 * so it works without JavaScript. Each is written in its own language, so someone in the wrong one
 * can find theirs. A plain `<a>`, not Next's `Link`: the route sets a cookie, so it must never be
 * prefetched.
 */
export const LanguageSwitch = ({ here = "/" }: { here?: string }) => {
  const t = useTranslations("common.languageSwitch");
  const current = useLocale() as Locale;
  const back = safeBackPath(here);
  return (
    <nav aria-label={t("label")} className="text-sm">
      <Disclosure
        align="right"
        compact
        summary={
          <>
            <Globe aria-hidden="true" className="size-4" />
            <span lang={current}>{LOCALE_NAMES[current]}</span>
            <ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />
          </>
        }
      >
        <ul className="grid">
          {LOCALES.map((locale) => (
            <li key={locale}>
              <a
                href={`${LANGUAGE_PATH}?set=${locale}&next=${encodeURIComponent(back)}`}
                lang={locale}
                hrefLang={locale}
                aria-current={locale === current ? "true" : undefined}
                className="touch-hit flex items-center justify-between gap-2 rounded-control px-3 py-2 text-fg outline-offset-[-2px] hover:bg-canvas focus-visible:outline-2 focus-visible:outline-focus aria-[current=true]:font-semibold"
              >
                {LOCALE_NAMES[locale]}
                {locale === current ? <Check aria-hidden="true" className="size-4" /> : null}
              </a>
            </li>
          ))}
        </ul>
      </Disclosure>
    </nav>
  );
};
