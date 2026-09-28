import { ItemPageView } from "@/features/item-page/ItemPageView";
import { DependenciesTab, FilesTab, ReadmeTab, RisksTab } from "@/features/item-page/ItemTabs";
import { type ItemParams, loadItemPage } from "@/features/item-page/load";
import { tabFrom } from "@/features/item-page/tabs";

export const metadata = { title: "Item · Ronne" };

type SearchParams = Promise<{ tab?: string | string[]; version?: string | string[] }>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * An item's page (feature 018): README, Dependencies, Files and What it can do, for `latest` or
 * `?version=`. Versions is its own path, `versions/`. Everyone signed in reads it.
 */
const Item = async ({
  params,
  searchParams,
}: {
  params: ItemParams;
  searchParams: SearchParams;
}) => {
  const query = await searchParams;
  const tab = tabFrom(first(query.tab));
  const page = await loadItemPage(params, first(query.version));
  const { shown } = page;
  return (
    <ItemPageView page={page} tab={tab}>
      {tab === "dependencies" ? (
        <DependenciesTab dependencies={shown.dependencies} />
      ) : tab === "files" ? (
        <FilesTab files={shown.files} />
      ) : tab === "risks" ? (
        <RisksTab flags={shown.riskFlags} />
      ) : (
        <ReadmeTab readme={shown.readme} description={page.item.description} />
      )}
    </ItemPageView>
  );
};

export default Item;
