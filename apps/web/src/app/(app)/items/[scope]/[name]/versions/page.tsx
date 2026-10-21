import { getTranslations } from "next-intl/server";
import { ItemPageView } from "@/features/item-page/ItemPageView";
import { type ItemParams, loadItemPage, loadUsageByVersion } from "@/features/item-page/load";
import { VersionsTab } from "@/features/versions/VersionsTab";
import { pageTitle } from "@/i18n/page-title";
import { holdPage } from "../../../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("item.page");
  return { title: pageTitle(t("versions")) };
};

/**
 * The item page's Versions tab (features 016 and 018): everyone signed in reads it; moderators and
 * root manage tags, deprecations and yanks.
 */
const Versions = async ({ params }: { params: ItemParams }) => {
  await holdPage();
  const page = await loadItemPage(params, undefined, "/versions");
  return (
    <ItemPageView page={page} tab="versions">
      <VersionsTab page={page} usage={await loadUsageByVersion(page.item.id)} />
    </ItemPageView>
  );
};

export default Versions;
