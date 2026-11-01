import { Panel } from "@/components/ui/Panel";
import { languageSettings } from "@/server/domains/settings/actions/settings";
import { requestHeaders } from "@/server/http/request-headers";
import { LanguagesForm } from "./LanguagesForm";

/** Admin › Settings › Languages (141). The page already refused anyone but root. */
export const LanguagesTab = async () => {
  const policy = await languageSettings(await requestHeaders());
  return (
    <Panel padding="lg">
      <LanguagesForm policy={policy} />
    </Panel>
  );
};
