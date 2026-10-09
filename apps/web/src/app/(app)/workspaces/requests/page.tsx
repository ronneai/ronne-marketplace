import { notFound } from "next/navigation";
import { Help } from "@/components/help/Help";
import { PageHeader } from "@/components/ui/Panel";
import { RequestsTable } from "@/features/workspace-requests/RequestsTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { canInSome } from "@/server/domains/identity/models/permissions";
import { requestsToAnswerList } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Requests to join · Ronne AI Marketplace" };

/**
 * Requests to join (094): every open request the reader can answer, in every workspace where they
 * moderate or administer, and all of them for root. The nav's Requests count opens it. Anyone who
 * answers nowhere gets a 404.
 */
const WorkspaceRequests = async () => {
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me || !canInSome(me, "access_requests.answer")) notFound();
  const { requests, total } = await requestsToAnswerList(request);
  return (
    <>
      <PageHeader
        title="Requests to join"
        description="People asking to join the workspaces you moderate. Approving adds them as users."
        actions={<Help id="requests-who" />}
      />
      <RequestsTable requests={requests} total={total} showWorkspace />
    </>
  );
};

export default WorkspaceRequests;
