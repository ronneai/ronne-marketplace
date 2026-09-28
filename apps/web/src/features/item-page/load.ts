import { notFound } from "next/navigation";
import { itemPage } from "@/server/domains/items/actions/versions";
import { ItemNotFoundError, VersionNotFoundError } from "@/server/domains/items/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";

export type ItemParams = Promise<{ scope: string; name: string }>;

/** The item page's data for a route; a missing item or version is a 404. */
export const loadItemPage = async (params: ItemParams, version?: string) => {
  const { scope, name } = await params;
  try {
    return await itemPage(
      await requestHeaders(),
      { scope: decodeURIComponent(scope).replace(/^@/, ""), name: decodeURIComponent(name) },
      version || undefined,
    );
  } catch (error) {
    if (error instanceof ItemNotFoundError || error instanceof VersionNotFoundError) notFound();
    throw error;
  }
};
