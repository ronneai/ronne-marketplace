import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { TabLinks } from "@/components/ui/TabLinks";
import { AuthenticationTab } from "@/features/admin-settings/authentication/AuthenticationTab";
import { ProviderPage } from "@/features/admin-settings/authentication/providers/ProviderPage";
import { PluginFeedsPanel } from "@/features/admin-settings/feeds/PluginFeedsPanel";
import { NoticeTab } from "@/features/admin-settings/notice/NoticeTab";
import { PrivacyTab } from "@/features/admin-settings/privacy/PrivacyTab";
import { SETTINGS_TABS, settingsTab } from "@/features/admin-settings/tabs";
import { UsageMinimumForm } from "@/features/admin-settings/usage/UsageMinimumForm";
import { UsagePolicyForm } from "@/features/admin-settings/usage/UsagePolicyForm";
import { pluginFeedStats } from "@/server/domains/feeds/actions/feeds";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";
import { settingsTitle } from "../metadata";

export const generateMetadata = settingsTitle;

/**
 * Root only (`settings.manage`): anyone else gets a 404. In tabs (122), by `?tab=`: Usage (046's
 * policy and 047's minimum, the default), Plugin feeds (079's last builds) and Authentication,
 * whose identity providers each have a page (`&provider=`, 106), Privacy (102's retention) and
 * Notice (124's message for every signed-in page; the first tab moved to messages, the rest follow in 131).
 * Only the tab shown reads its data.
 */
const AdminSettings = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  await holdPage();
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "settings.manage")) notFound();
  const query = await searchParams;
  const tab = settingsTab(query);
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const provider = tab === "authentication" ? one(query.provider) : undefined;
  const content = async () => {
    if (tab === "feeds")
      return (
        <Panel padding="lg">
          <PluginFeedsPanel rows={await pluginFeedStats(request)} />
        </Panel>
      );
    // A provider's page (106): `&provider=<id>`, or `new`.
    if (tab === "authentication" && provider)
      return await ProviderPage({ id: provider, test: one(query.test), preset: one(query.preset) });
    if (tab === "authentication") return await AuthenticationTab();
    if (tab === "privacy") return await PrivacyTab();
    if (tab === "notice") return await NoticeTab();
    const settings = await instanceSettings(request);
    return (
      <>
        <Panel padding="lg">
          <UsagePolicyForm policy={settings.usagePolicy} />
        </Panel>
        <Panel padding="lg">
          <UsageMinimumForm minimum={settings.usageMinimum} />
        </Panel>
      </>
    );
  };
  // The tabs are still English, except Notice, which is written in messages from the start.
  const noticeTab = (await getTranslations("admin.notice"))("tab");
  const tabs = SETTINGS_TABS.map((entry) =>
    entry.id === "notice" ? { ...entry, label: noticeTab } : entry,
  );
  return (
    <>
      <PageHeader
        title="Settings"
        description="How this instance behaves. Each change takes effect at once and is recorded in the audit log."
      />
      <TabLinks label="Settings" tabs={tabs} current={tab} />
      <div className="grid gap-4">{await content()}</div>
    </>
  );
};

export default AdminSettings;
