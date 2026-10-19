import { Panel } from "@/components/ui/Panel";
import { adminPendingErasures } from "@/server/domains/identity/actions/erase-user";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { retentionJobStatus } from "@/server/jobs/actions";
import { LastRun } from "./LastRun";
import { PendingErasures } from "./PendingErasures";
import { RetentionForm } from "./RetentionForm";

/**
 * Admin › Settings › Privacy (102): how long personal data is kept, the purge's last run, and an
 * erasure that wasn't completed (103), when there is one. The page calls it for its panels (root
 * only: the page already refused anyone else).
 */
export const PrivacyTab = async () => {
  const headers = await requestHeaders();
  const [settings, status, erasures] = await Promise.all([
    instanceSettings(headers),
    retentionJobStatus(),
    adminPendingErasures(headers),
  ]);
  return (
    <Panel padding="lg">
      <div className="grid gap-4">
        <RetentionForm retention={settings.retention} />
        <LastRun status={status} />
        <PendingErasures erasures={erasures} />
      </div>
    </Panel>
  );
};
