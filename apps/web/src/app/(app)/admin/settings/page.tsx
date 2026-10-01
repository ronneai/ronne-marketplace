import { notFound } from "next/navigation";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { UsageMinimumForm } from "@/features/admin-settings/UsageMinimumForm";
import { UsagePolicyForm } from "@/features/admin-settings/UsagePolicyForm";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Settings · Admin · Ronne AI Marketplace" };

/** Root only (`settings.manage`): anyone else gets a 404. Feature 046's usage policy first. */
const AdminSettings = async () => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "settings.manage")) notFound();
  const settings = await instanceSettings(request);
  return (
    <>
      <PageHeader
        title="Settings"
        description="How this instance behaves. Each change takes effect at once and is recorded in the audit log."
      />
      <div className="grid gap-4">
        <Panel padding="lg">
          <UsagePolicyForm policy={settings.usagePolicy} />
        </Panel>
        <Panel padding="lg">
          <UsageMinimumForm minimum={settings.usageMinimum} />
        </Panel>
      </div>
    </>
  );
};

export default AdminSettings;
