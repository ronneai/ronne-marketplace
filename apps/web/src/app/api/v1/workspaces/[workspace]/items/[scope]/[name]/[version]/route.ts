import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getVersion } from "@/server/http/registry-api";

/** One version of a workspace's item (019, 118). */
export const GET = apiRoute(
  "/api/v1/workspaces/[workspace]/items/[scope]/[name]/[version]",
  async (
    request: Request,
    {
      params,
    }: { params: Promise<{ workspace: string; scope: string; name: string; version: string }> },
  ) => {
    await connection();
    return getVersion(request, await params);
  },
);
