import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { LanguageForm } from "@/features/account/LanguageForm";
import { accountMetadata } from "@/features/account/metadata";
import { AccountTabs } from "@/features/account-security/AccountTabs";
import { requestChoosableLocales } from "@/i18n/server";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { isLocale } from "@/server/domains/identity/models/locale";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = accountMetadata("language");

/** Account › Language (feature 129): the language of the screens, on the person's profile. */
const LanguagePage = async () => {
  await holdPage();
  // Root turned choosing off (141): there is no Language section to show.
  const choosable = await requestChoosableLocales();
  if (choosable.length < 2) notFound();
  const t = await getTranslations("account");
  const user = await getCurrentUser(await requestHeaders());
  const saved = user?.locale ?? null;
  const savedLocale = isLocale(saved) ? saved : null;
  return (
    <>
      <PageHeader title={t("header.title")} description={t("header.languageDescription")} />
      <AccountTabs current="language" />
      <Panel padding="lg">
        <section aria-labelledby="language-title" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="language-title" className="text-base font-semibold text-fg">
              {t("language.title")}
            </h2>
            <p className="text-sm text-muted">{t("language.description")}</p>
          </div>
          <LanguageForm
            saved={savedLocale && choosable.includes(savedLocale) ? savedLocale : null}
            offered={choosable}
            notOffered={savedLocale && !choosable.includes(savedLocale) ? savedLocale : null}
          />
        </section>
      </Panel>
    </>
  );
};

export default LanguagePage;
