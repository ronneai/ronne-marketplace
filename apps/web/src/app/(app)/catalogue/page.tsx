import { PageHeader } from "@/components/ui/Panel";
import { CatalogueView } from "@/features/catalogue/CatalogueView";
import { parseCatalogueQuery, type SearchParams } from "@/features/catalogue/query";
import { browseCatalogue } from "@/server/domains/items/actions/catalogue";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Catalogue · Ronne" };

/** Every published item (feature 018), for everyone signed in (the (app) layout requires a session). */
const Catalogue = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const query = parseCatalogueQuery(await searchParams);
  const page = await browseCatalogue(await requestHeaders(), query);
  return (
    <>
      <PageHeader
        title="Catalogue"
        description="Every published item: skills, agents, rules, MCP servers and more, reviewed before release."
      />
      <CatalogueView page={page} paged={Boolean(query.cursor)} />
    </>
  );
};

export default Catalogue;
