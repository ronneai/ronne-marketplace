import { notFound } from "next/navigation";
import { dependencyFacts } from "@/server/domains/items/actions/catalogue";
import { itemPage, versionContents } from "@/server/domains/items/actions/versions";
import {
  ArtifactUnavailableError,
  ItemNotFoundError,
  VersionNotFoundError,
} from "@/server/domains/items/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { showFiles } from "./files/shown";

export type ItemParams = Promise<{ scope: string; name: string }>;

const refOf = ({ scope, name }: { scope: string; name: string }) => ({
  scope: decodeURIComponent(scope).replace(/^@/, ""),
  name: decodeURIComponent(name),
});

/** The item page's data for a route; a missing item or version is a 404. */
export const loadItemPage = async (params: ItemParams, version?: string) => {
  try {
    return await itemPage(await requestHeaders(), refOf(await params), version || undefined);
  } catch (error) {
    if (error instanceof ItemNotFoundError || error instanceof VersionNotFoundError) notFound();
    throw error;
  }
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
