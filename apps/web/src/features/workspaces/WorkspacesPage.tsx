import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import type { WorkspaceRole } from "@/server/domains/identity/models/user";
import type { OwnRequest } from "@/server/domains/workspaces/models/access-request";
import type { MyWorkspace } from "@/server/domains/workspaces/services/access-requests";
import { AskToJoinButton, CancelRequestButton } from "./RequestControls";

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  user: "User",
};

/**
 * Where a request stands, for its requester (094): Requested (cancel), or Declined on a date with
 * the reason. Nothing for an answered or cancelled one: the row offers Ask to join again.
 */
export const RequestState = ({ request }: { request: OwnRequest }) => {
  if (request.status === "open")
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>
          Requested <LocalTime value={request.createdAt} precision="day" />
        </span>
        <CancelRequestButton requestId={request.id} workspace={request.workspace} />
      </span>
    );
  if (request.status !== "declined" || !request.decidedAt) return null;
  const after = request.askAgainFrom;
  return (
    <span className="grid gap-0.5 text-sm text-muted">
      <span>
        Declined on <LocalTime value={request.decidedAt} precision="day" />
        {after ? (
          <>
            {"; ask again from "}
            <LocalTime value={after} precision="day" />
          </>
        ) : null}
      </span>
      {request.reason ? <span className="text-fg">“{request.reason}”</span> : null}
    </span>
  );
};

/** What a row offers someone who isn't in the workspace: their request's state, or Ask to join. */
const NotIn = ({ workspace, request }: { workspace: string; request: OwnRequest | undefined }) => {
  if (request?.status === "open") return <RequestState request={request} />;
  const canAsk = !request || request.askAgainFrom === null;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {request?.status === "declined" ? <RequestState request={request} /> : null}
      {canAsk ? <AskToJoinButton workspace={workspace} /> : null}
    </span>
  );
};

/**
 * /workspaces (094): the workspaces the reader sees, public ones and private ones they're in,
 * with their role in each, or Ask to join. Below, their requests to names not in that list: a
 * private workspace asked from its link, or a name no workspace has, which look the same.
 */
export const WorkspacesPage = ({
  workspaces,
  requests,
  root,
}: {
  workspaces: MyWorkspace[];
  requests: OwnRequest[];
  root: boolean;
}) => {
  const byName = new Map(requests.map((r) => [r.workspace, r]));
  const listed = new Set(workspaces.map((w) => w.name));
  const others = requests.filter(
    (r) => !listed.has(r.workspace) && (r.status === "open" || r.status === "declined"),
  );
  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Workspaces group scopes and their items. You propose and review in the ones you're in."
      />
      <div className="grid gap-8">
        <Table>
          <thead>
            <tr>
              <Th>Workspace</Th>
              <Th>Visibility</Th>
              <Th>You</Th>
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => (
              <tr key={w.name}>
                <Td className="py-2">
                  <span className="block font-mono text-[13px]">{w.name}</span>
                  <span className="block text-xs text-muted">{w.description}</span>
                </Td>
                <Td>
                  <Badge>
                    {w.isGlobal ? "Everyone" : w.visibility === "private" ? "Private" : "Public"}
                  </Badge>
                </Td>
                <Td className="py-2">
                  {root ? (
                    <Badge tone="accent">Root</Badge>
                  ) : w.role ? (
                    <Badge tone="accent">{ROLE_LABELS[w.role]}</Badge>
                  ) : (
                    <NotIn workspace={w.name} request={byName.get(w.name)} />
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {others.length > 0 ? (
          <section className="grid gap-3" aria-labelledby="other-requests">
            <h2 id="other-requests" className="text-base font-semibold text-fg">
              Your other requests
            </h2>
            <p className="text-sm text-muted">
              Asked from a join link. You see a workspace here once you're in it.
            </p>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Request</Th>
                </tr>
              </thead>
              <tbody>
                {others.map((r) => (
                  <tr key={r.id}>
                    <Td mono>{r.workspace}</Td>
                    <Td className="py-2">
                      <RequestState request={r} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>
        ) : null}
      </div>
    </>
  );
};
