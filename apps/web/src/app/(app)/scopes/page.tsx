import { PageHeader } from "@/components/ui/Panel";
import { parseScopesQuery, type SearchParams } from "@/features/scopes/query";
import { ScopesTable } from "@/features/scopes/ScopesTable";
import { listScopes } from "@/server/domains/items/actions/scopes";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Scopes · Ronne" };

/** Every signed-in user (the (app) layout requires a session). */
const Scopes = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const query = parseScopesQuery(await searchParams);
  const { scopes, nextCursor } = await listScopes(await requestHeaders(), query);
  return (
    <>
      <PageHeader
        title="Scopes"
        description="Every item lives in a scope, like @platform/code-reviewer. Anyone can propose items in any scope: review is the gate. Root creates new scopes."
      />
      <ScopesTable
        base="/scopes"
        scopes={scopes}
        search={query.search}
        nextCursor={nextCursor}
        paged={Boolean(query.cursor)}
      />
    </>
  );
};

export default Scopes;
