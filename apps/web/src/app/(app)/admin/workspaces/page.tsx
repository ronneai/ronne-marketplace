import { notFound } from "next/navigation";
import { Help } from "@/components/help/Help";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { ADMIN_WORKSPACES_LIST, workspacesQueryOf } from "@/features/admin-workspaces/list";
import { CreateWorkspaceDialog } from "@/features/admin-workspaces/WorkspaceDialogs";
import { WorkspacesTable } from "@/features/admin-workspaces/WorkspacesTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { pageWorkspaces } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Workspaces · Admin · Ronne AI Marketplace" };

/** Root only (`workspaces.manage`): anyone else gets a 404. */
const AdminWorkspaces = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "workspaces.manage")) notFound();
  const state = parseListQuery(ADMIN_WORKSPACES_LIST, await searchParams);
  const { workspaces, next, previous, total } = await pageWorkspaces(
    request,
    workspacesQueryOf(state),
  );
  return (
    <>
      <PageHeader
        title="Workspaces"
        description="A workspace holds scopes, and their items, for one team or group. Item names don't include it. Every instance has global."
        actions={<CreateWorkspaceDialog />}
      />
      <Help id="workspace" className="mb-4" />
      <WorkspacesTable
        list={ADMIN_WORKSPACES_LIST}
        state={state}
        workspaces={workspaces}
        page={{ next, previous }}
        total={total}
      />
    </>
  );
};

export default AdminWorkspaces;
