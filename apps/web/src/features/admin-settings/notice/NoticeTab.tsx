import { Panel } from "@/components/ui/Panel";
import { instanceSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { NoticeForm } from "./NoticeForm";

/** Admin › Settings › Notice (124). The page already refused anyone but root. */
export const NoticeTab = async () => {
  const { notice } = await instanceSettings(await requestHeaders());
  return (
    <Panel padding="lg">
      <NoticeForm
        notice={notice}
        changed={notice.changedAt ? { at: notice.changedAt, byName: notice.changedByName } : null}
      />
    </Panel>
  );
};
