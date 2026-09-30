import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { FilesBrowser } from "@/features/item-page/files/FilesBrowser";
import { selectedFile } from "@/features/item-page/files/shown";
import { ItemPageView } from "@/features/item-page/ItemPageView";
import { DependenciesTab, ReadmeTab, RisksTab } from "@/features/item-page/ItemTabs";
import {
  type ItemParams,
  loadContents,
  loadDependencyFacts,
  loadItemPage,
} from "@/features/item-page/load";
import { bodyPathOf } from "@/features/item-page/overview/model";
import { OverviewTab, UnavailableFiles } from "@/features/item-page/overview/OverviewTab";
import { itemTabHref, tabFrom } from "@/features/item-page/tabs";

export const metadata = { title: "Item · Ronne AI Marketplace" };

type SearchParams = Promise<{
  tab?: string | string[];
  version?: string | string[];
  file?: string | string[];
}>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Overview and Files show the released files; the helper says what that means (044). */
const WithContentsHelp = ({ children }: { children: ReactNode }) => (
  <div className="grid gap-3">
    <Help id="contents" className="justify-self-end" />
    {children}
  </div>
);

/**
 * An item's page (feature 018): Overview (044), README, Dependencies, Files and What it can do,
 * for `latest` or `?version=`. Versions is its own path, `versions/`. Everyone signed in reads it.
 * Overview and Files read the version's files from its artifact; the other tabs never do.
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
  const ref = { scope: page.item.scope.name, name: page.item.name };
  const type = page.item.type;
  const files =
    tab === "overview" || tab === "files" ? await loadContents(ref, shown.version) : null;
  const bodyPath = bodyPathOf(shown.manifest, type);
  const version = shown.version !== page.listed ? shown.version : null;
  return (
    <ItemPageView page={page} tab={tab}>
      {tab === "overview" ? (
        <WithContentsHelp>
          <OverviewTab
            itemName={`@${ref.scope}/${ref.name}`}
            type={type}
            manifest={shown.manifest}
            dependencies={shown.dependencies}
            files={files}
            facts={await loadDependencyFacts(shown.dependencies)}
            filesHref={itemTabHref(ref, "files", version)}
          />
        </WithContentsHelp>
      ) : tab === "dependencies" ? (
        <DependenciesTab dependencies={shown.dependencies} />
      ) : tab === "files" ? (
        <WithContentsHelp>
          {files ? (
            <FilesBrowser
              key={shown.version}
              files={files}
              selected={selectedFile(files, first(query.file), bodyPath)}
            />
          ) : (
            <UnavailableFiles />
          )}
        </WithContentsHelp>
      ) : tab === "risks" ? (
        <RisksTab flags={shown.riskFlags} />
      ) : (
        <ReadmeTab readme={shown.readme} description={page.item.description} />
      )}
    </ItemPageView>
  );
};

export default Item;
