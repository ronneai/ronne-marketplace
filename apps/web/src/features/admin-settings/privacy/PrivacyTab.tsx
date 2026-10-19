import { Panel } from "@/components/ui/Panel";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { retentionJobStatus } from "@/server/jobs/actions";
import { LastRun } from "./LastRun";
import { RetentionForm } from "./RetentionForm";

/**
 * Admin › Settings › Privacy (102): how long personal data is kept, and the purge's last run. The
 * page calls it for its panels (root only: the page already refused anyone else).
 */
export const PrivacyTab = async () => {
  const [settings, status] = await Promise.all([
    instanceSettings(await requestHeaders()),
    retentionJobStatus(),
  ]);
  return (
    <Panel padding="lg">
      <div className="grid gap-4">
        <RetentionForm retention={settings.retention} />
        <LastRun status={status} />
      </div>
    </Panel>
  );
};
