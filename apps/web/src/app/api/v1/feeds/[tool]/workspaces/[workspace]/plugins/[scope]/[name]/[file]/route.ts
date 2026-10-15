import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getPluginZip } from "@/server/http/feeds-api";

type Context = {
  params: Promise<{ tool: string; workspace: string; scope: string; name: string; file: string }>;
};

/** A workspace's item's plugin zip (077, 118: `global`'s are at /plugins). */
export const GET = apiRoute(
  "/api/v1/feeds/[tool]/workspaces/[workspace]/plugins/[scope]/[name]/[file]",
  async (request: Request, { params }: Context) => {
    await connection();
    return getPluginZip(request, await params);
  },
);

/** The same headers, without the body or a count. */
export const HEAD = apiRoute(
  "/api/v1/feeds/[tool]/workspaces/[workspace]/plugins/[scope]/[name]/[file]",
  async (request: Request, { params }: Context) => {
    await connection();
    return getPluginZip(request, await params);
  },
);
