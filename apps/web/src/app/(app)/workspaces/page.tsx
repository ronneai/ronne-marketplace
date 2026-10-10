import { WorkspacesPage } from "@/features/workspaces/WorkspacesPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { myWorkspaces, ownRequests } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Workspaces · Ronne AI Marketplace" };

/** Every signed-in user's workspaces and requests to join (094); the (app) layout requires a session. */
const Workspaces = async () => {
  const request = await requestHeaders();
  const [me, workspaces, requests] = await Promise.all([
    getCurrentUser(request),
    myWorkspaces(request),
    ownRequests(request),
  ]);
  return <WorkspacesPage workspaces={workspaces} requests={requests} root={me?.role === "root"} />;
};

export default Workspaces;
