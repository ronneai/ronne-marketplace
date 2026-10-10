import Versions from "../../../../../../items/[scope]/[name]/versions/page";

export const metadata = { title: "Versions · Ronne AI Marketplace" };

type Params = Promise<{ name: string; scope: string; item: string }>;

/** A workspace's item's Versions page (118), the same page as `global`'s. */
const WorkspaceVersions = async ({ params }: { params: Params }) => {
  const { name, scope, item } = await params;
  return Versions({ params: Promise.resolve({ workspace: name, scope, name: item }) });
};

export default WorkspaceVersions;
