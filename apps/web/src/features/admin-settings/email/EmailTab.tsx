import { Panel } from "@/components/ui/Panel";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { adminMailSetup } from "@/server/domains/mail/actions/mail";
import { requestHeaders } from "@/server/http/request-headers";
import { EmailActions } from "./EmailActions";
import { EmailForm } from "./EmailForm";
import { EmailStatus } from "./EmailStatus";

/**
 * Admin › Settings › Email (189): the status, the setup (never a secret: only whether one is
 * saved), the test email to root's own address, and Stop sending. Root only: the page already
 * refused anyone else.
 */
export const EmailTab = async () => {
  const headers = await requestHeaders();
  const [setup, user] = await Promise.all([adminMailSetup(headers), getCurrentUser(headers)]);
  return (
    <>
      <Panel padding="lg">
        <EmailStatus status={setup.status} />
      </Panel>
      <Panel padding="lg">
        <EmailForm setup={setup} />
      </Panel>
      {setup.status === "not_set_up" ? null : (
        <Panel padding="lg">
          <EmailActions to={user?.email ?? ""} />
        </Panel>
      )}
    </>
  );
};
