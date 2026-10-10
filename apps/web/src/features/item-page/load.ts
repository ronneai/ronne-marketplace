import { formatItemName, GLOBAL_WORKSPACE, type ItemType } from "@ronneai/core";
import { notFound, redirect } from "next/navigation";
import { itemPath } from "@/components/catalogue/ItemCard";
import { showFiles } from "@/components/files/shown";
import { loadConfig } from "@/server/config";
import { inClaudeCodeFeed, pluginInstallCommand } from "@/server/domains/feeds/actions/feeds";
import { dependencyFacts } from "@/server/domains/items/actions/catalogue";
import { type ItemPage, itemPage, versionContents } from "@/server/domains/items/actions/versions";
import {
  ArtifactUnavailableError,
  ItemNotFoundError,
  VersionNotFoundError,
} from "@/server/domains/items/exceptions/errors";
import { itemUsage, itemUsageByVersion } from "@/server/domains/usage/actions/usage";
import { requestHeaders } from "@/server/http/request-headers";

export type ItemParams = Promise<{ workspace?: string; scope: string; name: string }>;

const refOf = ({
  workspace,
  scope,
  name,
}: {
  workspace?: string;
  scope: string;
  name: string;
}) => ({
  workspace: workspace ? decodeURIComponent(workspace) : GLOBAL_WORKSPACE,
  scope: decodeURIComponent(scope).replace(/^@/, ""),
  name: decodeURIComponent(name),
});

/**
 * The item page's data for a route; a missing item or version is a 404. An old name (118) goes to
 * the item's page under its name now, `rest` (such as `/versions`) and `?version=` kept.
 */
export const loadItemPage = async (params: ItemParams, version?: string, rest = "") => {
  const ref = refOf(await params);
  let page: ItemPage;
  try {
    page = await itemPage(await requestHeaders(), ref, version || undefined);
  } catch (error) {
    if (error instanceof ItemNotFoundError || error instanceof VersionNotFoundError) notFound();
    throw error;
  }
  // An old name, or `global` written out (`/workspaces/global/items/…`): one address per item.
  if (page.item.fullName !== formatItemName(ref) || (await params).workspace === GLOBAL_WORKSPACE)
    redirect(
      `${itemPath({ workspace: page.item.workspace, scope: page.item.scope.name, name: page.item.name })}${rest}${version ? `?version=${encodeURIComponent(version)}` : ""}`,
    );
  return page;
};

/**
 * The shown version's files with their contents, for Overview and Files (044), with Markdown
 * rendered; null when its artifact can't be read, which the tabs say instead of failing the page.
 */
export const loadContents = async (ref: { scope: string; name: string }, version: string) => {
  try {
    return showFiles(await versionContents(await requestHeaders(), ref, version));
  } catch (error) {
    if (error instanceof ArtifactUnavailableError) return null;
    throw error;
  }
};

/** The catalogue's facts about the shown version's dependencies, for the read-only canvas (044). */
export const loadDependencyFacts = async (dependencies: Record<string, string>) =>
  Object.keys(dependencies).length === 0
    ? {}
    : dependencyFacts(await requestHeaders(), Object.keys(dependencies));

/** The item's usage for the Overview (047). */
export const loadUsage = async (item: { id: string; type: ItemType }) =>
  itemUsage(await requestHeaders(), item);

/** Runs and installs per version for the Versions page (047), or null when there are none. */
export const loadUsageByVersion = async (itemId: string) =>
  itemUsageByVersion(await requestHeaders(), itemId);

/**
 * The `/plugin install` command for the Install panel (077), or null: when the page shows the
 * listed version, it isn't yanked, the instance has a PUBLIC_URL, and the item is in the Claude
 * Code feed.
 */
export const pluginCommandOf = (
  page: ItemPage,
  publicUrl: string | undefined = loadConfig().publicUrl,
): string | null => {
  const { shown } = page;
  const item = {
    workspace: page.item.workspace,
    scope: page.item.scope.name,
    name: page.item.name,
    type: page.item.type,
  };
  if (!publicUrl || !page.installable || shown.version !== page.listed || shown.yankedAt)
    return null;
  return inClaudeCodeFeed(item, shown.manifest) ? pluginInstallCommand(item, publicUrl) : null;
};
