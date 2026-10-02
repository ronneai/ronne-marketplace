import { notFound } from "next/navigation";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { CreateScopeDialog, EditScopeButton } from "@/features/admin-scopes/ScopeDialogs";
import { ADMIN_SCOPES_LIST, scopesQueryOf } from "@/features/scopes/list";
import { ScopesTable } from "@/features/scopes/ScopesTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { pageScopes } from "@/server/domains/items/actions/scopes";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Scopes · Admin · Ronne AI Marketplace" };

/** Root only (`scopes.manage`): anyone else gets a 404. */
const AdminScopes = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "scopes.manage")) notFound();
  const state = parseListQuery(ADMIN_SCOPES_LIST, await searchParams);
  const { scopes, next, previous, total } = await pageScopes(request, scopesQueryOf(state));
  return (
    <>
      <PageHeader
        title="Scopes"
        description="Every item lives in a scope. Names can't be changed once created, because items and installs depend on them."
        actions={<CreateScopeDialog />}
      />
      <ScopesTable
        list={ADMIN_SCOPES_LIST}
        state={state}
        scopes={scopes}
        page={{ next, previous }}
        total={total}
        actions={(scope) => <EditScopeButton name={scope.name} description={scope.description} />}
      />
    </>
  );
};

export default AdminScopes;
