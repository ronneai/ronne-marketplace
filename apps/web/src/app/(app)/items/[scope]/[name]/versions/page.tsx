import { ItemPageView } from "@/features/item-page/ItemPageView";
import { type ItemParams, loadItemPage, loadUsageByVersion } from "@/features/item-page/load";
import { VersionsTab } from "@/features/versions/VersionsTab";

export const metadata = { title: "Versions · Ronne AI Marketplace" };

/**
 * The item page's Versions tab (features 016 and 018): everyone signed in reads it; moderators and
 * root manage tags, deprecations and yanks.
 */
const Versions = async ({ params }: { params: ItemParams }) => {
  const page = await loadItemPage(params);
  return (
    <ItemPageView page={page} tab="versions">
      <VersionsTab page={page} usage={await loadUsageByVersion(page.item.id)} />
    </ItemPageView>
  );
};

export default Versions;
