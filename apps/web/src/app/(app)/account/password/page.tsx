import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { ChangePasswordForm } from "@/features/account/ChangePasswordForm";
import { accountMetadata } from "@/features/account/metadata";
import { YourDataSection } from "@/features/account/YourDataSection";
import { AccountTabs } from "@/features/account-security/AccountTabs";
import { ShowAgainSection } from "@/features/getting-started/ShowAgainSection";
import { passwordChangeRequired } from "@/server/domains/identity/actions/session";
import { myLastExport } from "@/server/domains/identity/actions/user-data";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = accountMetadata("password");

/**
 * The (app) layout already requires a signed-in user. Someone root asked to choose their own
 * password (128) is held here: the page says why, shows only the form, and sends them on to the
 * page they asked for (`next`) once it's changed.
 */
const ChangePasswordPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) => {
  await holdPage();
  const t = await getTranslations("account");
  const request = await requestHeaders();
  const required = await passwordChangeRequired(request);
  if (required) {
    const { next } = await searchParams;
    return (
      <>
        <PageHeader title={t("password.title")} />
        <Notice kind="info" title={t("password.required.title")}>
          {t("password.required.body")}
        </Notice>
        <Panel padding="lg" className="mt-6">
          <ChangePasswordForm returnTo={typeof next === "string" ? safeNextPath(next) : "/"} />
        </Panel>
      </>
    );
  }
  const lastDownloadedAt = await myLastExport(request);
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
