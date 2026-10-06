import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { ADMIN_SCOPES_LIST, scopesQueryOf } from "@/features/admin-scopes/list";
import { EditScopeButton } from "@/features/admin-scopes/ScopeDialogs";
import { ScopesTable } from "@/features/admin-scopes/ScopesTable";
import { workspacePath } from "@/features/admin-workspaces/list";
import {
  DeleteWorkspaceButton,
  EditWorkspaceButton,
} from "@/features/admin-workspaces/WorkspaceDialogs";
import { VISIBILITY_LABELS } from "@/features/admin-workspaces/WorkspacesTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { pageScopes } from "@/server/domains/items/actions/scopes";
import { findWorkspace } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Workspace · Admin · Ronne AI Marketplace" };

/** The name from the address; a malformed escape is left as typed, and then isn't found. */
const decoded = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * One workspace (feature 090): its description, which root edits, and its scopes. `global` can't
 * be edited or deleted; another workspace can be deleted while it has no scopes. Root only.
 */
const AdminWorkspace = async ({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<SearchParams>;
}) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "workspaces.manage")) notFound();
  const { name } = await params;
  const workspace = await findWorkspace(request, decoded(name));
  if (!workspace) notFound();

  // The scope table, on this page's own address.
  const list = { ...ADMIN_SCOPES_LIST, path: workspacePath(workspace.name) };
  const state = parseListQuery(list, await searchParams);
  const scopes = await pageScopes(request, { ...scopesQueryOf(state), workspaceId: workspace.id });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link
          href="/admin/workspaces"
          className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          All workspaces
        </Link>
      </p>
      <PageHeader
        title={<span className="font-mono">{workspace.name}</span>}
        description={workspace.description}
        actions={
          workspace.isGlobal ? null : (
            <>
              <EditWorkspaceButton name={workspace.name} description={workspace.description} />
              <DeleteWorkspaceButton name={workspace.name} scopes={workspace.scopes} />
            </>
          )
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge>{VISIBILITY_LABELS[workspace.visibility]}</Badge>
        {workspace.isGlobal ? (
          <span>Every instance has it, and everyone is in it. It can't be changed or deleted.</span>
        ) : null}
      </div>
      <h2 className="mb-3 text-lg font-semibold text-fg">Scopes</h2>
      <ScopesTable
        list={list}
        state={state}
        scopes={scopes.scopes}
        page={{ next: scopes.next, previous: scopes.previous }}
        total={scopes.total}
        actions={(scope) => <EditScopeButton name={scope.name} description={scope.description} />}
      />
    </>
  );
};

export default AdminWorkspace;
