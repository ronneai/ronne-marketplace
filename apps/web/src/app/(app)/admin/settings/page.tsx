import { notFound } from "next/navigation";
import type { SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { TabLinks } from "@/components/ui/TabLinks";
import { AuthenticationTab } from "@/features/admin-settings/authentication/AuthenticationTab";
import { ProviderPage } from "@/features/admin-settings/authentication/providers/ProviderPage";
import { PluginFeedsPanel } from "@/features/admin-settings/feeds/PluginFeedsPanel";
import { SETTINGS_TABS, settingsTab } from "@/features/admin-settings/tabs";
import { UsageMinimumForm } from "@/features/admin-settings/usage/UsageMinimumForm";
import { UsagePolicyForm } from "@/features/admin-settings/usage/UsagePolicyForm";
import { pluginFeedStats } from "@/server/domains/feeds/actions/feeds";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const metadata = { title: "Settings · Admin · Ronne AI Marketplace" };

/**
 * Root only (`settings.manage`): anyone else gets a 404. In tabs (122), by `?tab=`: Usage (046's
 * policy and 047's minimum, the default), Plugin feeds (079's last builds) and Authentication,
 * whose identity providers each have a page (`&provider=`, 106). Only the tab shown reads its data.
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
  return (
    <>
      <PageHeader
        title="Settings"
        description="How this instance behaves. Each change takes effect at once and is recorded in the audit log."
      />
      <TabLinks label="Settings" tabs={SETTINGS_TABS} current={tab} />
      <div className="grid gap-4">{await content()}</div>
    </>
  );
};

export default AdminSettings;
