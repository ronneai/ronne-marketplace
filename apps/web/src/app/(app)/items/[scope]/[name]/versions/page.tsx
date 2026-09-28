import { notFound } from "next/navigation";
import { VersionsPage } from "@/features/versions/VersionsPage";
import { listVersions, type VersionsPage as Page } from "@/server/domains/items/actions/versions";
import { ItemNotFoundError } from "@/server/domains/items/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Versions · Ronne" };

/** An item's versions and tags (feature 016): everyone signed in reads; moderators and root manage. */
const Versions = async ({ params }: { params: Promise<{ scope: string; name: string }> }) => {
  const { scope, name } = await params;
  let page: Page;
  try {
    page = await listVersions(await requestHeaders(), {
      scope: decodeURIComponent(scope).replace(/^@/, ""),
      name: decodeURIComponent(name),
    });
  } catch (error) {
    if (error instanceof ItemNotFoundError) notFound();
    throw error;
  }
  return <VersionsPage page={page} />;
};

export default Versions;
