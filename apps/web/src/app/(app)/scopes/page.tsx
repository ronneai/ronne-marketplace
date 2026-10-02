import Link from "next/link";
import { docsHref } from "@/components/help/topics";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { SCOPES_LIST, scopesQueryOf } from "@/features/scopes/list";
import { ScopesTable } from "@/features/scopes/ScopesTable";
import { pageScopes } from "@/server/domains/items/actions/scopes";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Scopes · Ronne AI Marketplace" };

/** Every signed-in user (the (app) layout requires a session). */
const Scopes = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const state = parseListQuery(SCOPES_LIST, await searchParams);
  const { scopes, next, previous, total } = await pageScopes(
    await requestHeaders(),
    scopesQueryOf(state),
  );
  return (
    <>
      <PageHeader
        title="Scopes"
        description={
          <>
            Every item lives in a scope, like @platform/code-reviewer. Anyone can propose items in
            any scope: review is the gate. Root creates new scopes.{" "}
            <Link href={docsHref("scopes")} className="text-link underline underline-offset-2">
              More about scopes
            </Link>
          </>
        }
      />
      <ScopesTable
        list={SCOPES_LIST}
        state={state}
        scopes={scopes}
        page={{ next, previous }}
        total={total}
      />
    </>
  );
};

export default Scopes;
