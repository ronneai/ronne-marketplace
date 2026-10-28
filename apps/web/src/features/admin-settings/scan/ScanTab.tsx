import { Panel } from "@/components/ui/Panel";
import { skillScanSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { SkillScanForm } from "./SkillScanForm";

/**
 * Admin › Settings › Security scan (135): what the operator set up, what the scanner said last,
 * and root's switch, types and analysis. Root only: the page already refused anyone else.
 */
export const ScanTab = async () => {
  const settings = await skillScanSettings(await requestHeaders());
  return (
    <Panel padding="lg">
      <SkillScanForm settings={settings} />
    </Panel>
  );
};
