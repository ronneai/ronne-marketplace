import { notFound } from "next/navigation";
import { Help } from "@/components/help/Help";
import { PageHeader } from "@/components/ui/Panel";
import { RequestsTable } from "@/features/workspace-requests/RequestsTable";
import { ScopeMovesTable } from "@/features/workspace-requests/ScopeMovesTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { canInSomeShared } from "@/server/domains/identity/models/permissions";
import {
  movesToAnswer,
  requestsToAnswerList,
} from "@/server/domains/workspaces/actions/workspaces";
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
  // Nobody asks to join a personal workspace (114): owning one answers nothing.
  if (!me || !canInSomeShared(me, "access_requests.answer")) notFound();
  const [{ requests, total }, { moves }] = await Promise.all([
    requestsToAnswerList(request),
    movesToAnswer(request),
  ]);
  // Scope moves (115) are root's, and a shared workspace's admins' for moves into theirs.
  const answersMoves = me.role === "root" || canInSomeShared(me, "scopes.move");
  return (
    <>
      <PageHeader
        title="Requests to join"
        description="People asking to join the workspaces you moderate. Approving adds them as users."
        actions={<Help id="requests-who" />}
      />
      <RequestsTable requests={requests} total={total} showWorkspace />
      {answersMoves ? (
        <section aria-labelledby="scope-moves" className="mt-8 grid gap-3">
          <h2 id="scope-moves" className="text-base font-semibold text-fg">
            Scope moves
          </h2>
          <p className="text-sm text-muted">
            Scopes their workspaces' admins asked to move into a workspace you run. Approving checks
            the move again and moves it.
          </p>
          <ScopeMovesTable moves={moves} showTarget />
        </section>
      ) : null}
    </>
  );
};

export default WorkspaceRequests;
