import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getPluginZip } from "@/server/http/feeds-api";

type Context = { params: Promise<{ tool: string; scope: string; name: string; file: string }> };

/** A version's plugin zip, with its sha256 as the ETag; each GET is counted (feature 077). */
export const GET = apiRoute(
  "/api/v1/feeds/[tool]/plugins/[scope]/[name]/[file]",
  async (request: Request, { params }: Context) => {
    await connection();
    return getPluginZip(request, await params);
  },
);

/** The same headers, without the body or a count. */
export const HEAD = apiRoute(
  "/api/v1/feeds/[tool]/plugins/[scope]/[name]/[file]",
  async (request: Request, { params }: Context) => {
    await connection();
    return getPluginZip(request, await params);
  },
);
