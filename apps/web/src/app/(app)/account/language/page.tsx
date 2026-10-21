import { getTranslations } from "next-intl/server";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { LanguageForm } from "@/features/account/LanguageForm";
import { accountMetadata } from "@/features/account/metadata";
import { AccountTabs } from "@/features/account-security/AccountTabs";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = accountMetadata("language");

/** Account › Language (feature 129): the language of the screens, on the person's profile. */
const LanguagePage = async () => {
  await holdPage();
  const t = await getTranslations("account");
  const user = await getCurrentUser(await requestHeaders());
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
          <LanguageForm saved={user?.locale ?? null} />
        </section>
      </Panel>
    </>
  );
};

export default LanguagePage;
