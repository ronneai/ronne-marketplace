import { formatScopeName } from "@ronneai/core";
import { notFound } from "next/navigation";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { ADMIN_SCOPES_LIST, scopesQueryOf } from "@/features/admin-scopes/list";
import { CreateScopeDialog, EditScopeButton } from "@/features/admin-scopes/ScopeDialogs";
import { ScopesTable } from "@/features/admin-scopes/ScopesTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { pageScopes } from "@/server/domains/items/actions/scopes";
import { listWorkspaces } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Scopes · Admin · Ronne AI Marketplace" };

/** Root only (`scopes.manage`): anyone else gets a 404. */
const AdminScopes = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "scopes.manage")) notFound();
  const state = parseListQuery(ADMIN_SCOPES_LIST, await searchParams);
  const workspaces = await listWorkspaces(request);
  // A workspace that doesn't exist (a stale link) matches no scope, and its chip still shows.
  const filtered = state.filters.workspace
    ? (workspaces.find((w) => w.name === state.filters.workspace)?.id ?? "none")
    : undefined;
  const { scopes, next, previous, total } = await pageScopes(request, {
    ...scopesQueryOf(state),
    workspaceId: filtered,
  });
  return (
    <>
      <PageHeader
        title="Scopes"
        description="Every item lives in a scope. Names can't be changed once created, because items and installs depend on them."
        actions={
          <CreateScopeDialog workspaces={workspaces.map(({ id, name }) => ({ id, name }))} />
        }
      />
      <ScopesTable
        list={ADMIN_SCOPES_LIST}
        state={state}
        scopes={scopes}
        page={{ next, previous }}
        total={total}
        actions={(scope) => (
          // Scope names are unique per workspace (118): `acme/infra` says which one.
          <EditScopeButton
            name={formatScopeName({ workspace: scope.workspace.name, scope: scope.name }).slice(1)}
            description={scope.description}
          />
        )}
        workspaces={workspaces.map(({ name }) => ({ name }))}
      />
    </>
  );
};

export default AdminScopes;
