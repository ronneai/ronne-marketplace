import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/Panel";
import { CreateScopeDialog, EditScopeButton } from "@/features/admin-scopes/ScopeDialogs";
import { parseScopesQuery, type SearchParams } from "@/features/scopes/query";
import { ScopesTable } from "@/features/scopes/ScopesTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { listScopes } from "@/server/domains/items/actions/scopes";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Scopes · Admin · Ronne" };

/** Root only (`scopes.manage`): anyone else gets a 404. */
const AdminScopes = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "scopes.manage")) notFound();
  const query = parseScopesQuery(await searchParams);
  const { scopes, nextCursor } = await listScopes(request, query);
  return (
    <>
      <PageHeader
        title="Scopes"
        description="Every item lives in a scope. Names can't be changed once created, because items and installs depend on them."
        actions={<CreateScopeDialog />}
      />
      <ScopesTable
        base="/admin/scopes"
        scopes={scopes}
        search={query.search}
        nextCursor={nextCursor}
        paged={Boolean(query.cursor)}
        actions={(scope) => <EditScopeButton name={scope.name} description={scope.description} />}
      />
    </>
  );
};

export default AdminScopes;
