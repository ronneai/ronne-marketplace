import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/Panel";
import { CatalogueView } from "@/features/catalogue/CatalogueView";
import { parseCatalogueQuery, parseLayout, type SearchParams } from "@/features/catalogue/query";
import { hereOf } from "@/features/current-workspace/current-workspace";
import { Showing } from "@/features/current-workspace/Showing";
import { pageTitle } from "@/i18n/page-title";
import { browseCatalogue } from "@/server/domains/items/actions/catalogue";
import { favoritedAmong } from "@/server/domains/shelves/actions/favorites";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../hold";
import { workspaceView } from "../shell";

export const generateMetadata = async () => {
  const t = await getTranslations("catalogue.page");
  return { title: pageTitle(t("title")) };
};

/**
 * Every published item (feature 018), for everyone signed in (the (app) layout requires a session).
 * The current workspace (120) filters it, through the same `?workspace=` as its Workspace filter
 * (090), which also offers public workspaces the reader isn't in.
 */
const Catalogue = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  await holdPage();
  const params = await searchParams;
  const view = await workspaceView("/catalogue", params);
  const query = { ...parseCatalogueQuery(params), workspace: view.workspace ?? undefined };
  const headers = await requestHeaders();
  const page = await browseCatalogue(headers, query);
  const favorites = [
    ...(await favoritedAmong(
      headers,
      page.entries.map((entry) => entry.id),
    )),
  ];
  const t = await getTranslations("catalogue.page");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {view.workspace ? (
        <Showing
          workspace={view.workspace}
          here={hereOf("/catalogue", params)}
          // The same words for a private workspace as for no workspace at all (093).
          why={page.workspaces.includes(view.workspace) ? undefined : "missing"}
        />
      ) : null}
      <CatalogueView
        page={page}
        paged={Boolean(query.cursor)}
        keepAll={view.keepAll}
        favorites={favorites}
        layout={parseLayout(params)}
      />
    </>
  );
};

export default Catalogue;
