import { getTranslations } from "next-intl/server";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";
import { accountMetadata } from "@/features/account/metadata";
import { YourDataSection } from "@/features/account/YourDataSection";
import { AccountTabs } from "@/features/account-security/AccountTabs";
import { ShowAgainSection } from "@/features/getting-started/ShowAgainSection";
import { myLastExport } from "@/server/domains/identity/actions/user-data";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = accountMetadata("password");

/** The (app) layout already requires a signed-in user. */
const ChangePasswordPage = async () => {
  await holdPage();
  const t = await getTranslations("account");
  const lastDownloadedAt = await myLastExport(await requestHeaders());
  return (
    <>
      <PageHeader title={t("header.title")} description={t("header.description")} />
      <AccountTabs current="password" />
      <Panel padding="lg">
        <section aria-labelledby="password-title" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="password-title" className="text-base font-semibold text-fg">
              {t("password.title")}
            </h2>
            <p className="text-sm text-muted">{t("password.intro")}</p>
          </div>
          <ChangePasswordForm />
        </section>
      </Panel>
      <Panel padding="lg" className="mt-6">
        <YourDataSection lastDownloadedAt={lastDownloadedAt} />
      </Panel>
      <Panel padding="lg" className="mt-6">
        <ShowAgainSection />
      </Panel>
    </>
  );
};

export default ChangePasswordPage;
