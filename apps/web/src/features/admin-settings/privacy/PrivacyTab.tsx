import { Panel } from "@/components/ui/Panel";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { RetentionForm } from "./RetentionForm";

/**
 * Admin › Settings › Privacy (102): how long personal data is kept. The page calls it for its
 * panels (root only: the page already refused anyone else). Task 5 adds the last purge's line.
 */
export const PrivacyTab = async () => {
  const settings = await instanceSettings(await requestHeaders());
  return (
    <Panel padding="lg">
      <RetentionForm retention={settings.retention} />
    </Panel>
  );
};
