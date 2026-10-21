import { getTranslations } from "next-intl/server";
import { pageTitle } from "@/i18n/page-title";
import { holdPage } from "../../../../../../hold";
import Versions from "../../../../../../items/[scope]/[name]/versions/page";

export const generateMetadata = async () => {
  const t = await getTranslations("item.page");
  return { title: pageTitle(t("versions")) };
};

type Params = Promise<{ name: string; scope: string; item: string }>;

/** A workspace's item's Versions page (118), the same page as `global`'s. */
const WorkspaceVersions = async ({ params }: { params: Params }) => {
  await holdPage();
  const { name, scope, item } = await params;
  return Versions({ params: Promise.resolve({ workspace: name, scope, name: item }) });
};

export default WorkspaceVersions;
