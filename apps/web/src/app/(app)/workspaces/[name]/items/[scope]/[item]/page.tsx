import { getTranslations } from "next-intl/server";
import { pageTitle } from "@/i18n/page-title";
import { holdPage } from "../../../../../hold";
import Item from "../../../../../items/[scope]/[name]/page";

export const generateMetadata = async () => {
  const t = await getTranslations("item.page");
  return { title: pageTitle(t("item")) };
};

type Params = Promise<{ name: string; scope: string; item: string }>;

/**
 * A workspace's item page (118): `/workspaces/<workspace>/items/<scope>/<name>`, the same page as
 * `global`'s `/items/<scope>/<name>`. The workspace segment is `[name]`, as the join page's (094).
 */
const WorkspaceItem = async ({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Parameters<typeof Item>[0]["searchParams"];
}) => {
  await holdPage();
  const { name, scope, item } = await params;
  return Item({
    params: Promise.resolve({ workspace: name, scope, name: item }),
    searchParams,
  });
};

export default WorkspaceItem;
