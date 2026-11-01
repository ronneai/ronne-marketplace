import { Panel } from "@/components/ui/Panel";
import { updateSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { updatePlans } from "@/server/runtime";
import { UpdatesPanel } from "./UpdatesPanel";

/** Admin › Settings › Updates (140). The page already refused anyone but root. */
export const UpdatesTab = async () => {
  const settings = await updateSettings(await requestHeaders());
  return (
    <Panel padding="lg">
      <UpdatesPanel settings={settings} plans={updatePlans()} />
    </Panel>
  );
};
