import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getTarball } from "@/server/http/registry-api";

type Context = {
  params: Promise<{ workspace: string; scope: string; name: string; version: string }>;
};

/** A workspace's item's artifact, with its checksum; each GET is counted (019, 118). */
export const GET = apiRoute(
  "/api/v1/workspaces/[workspace]/items/[scope]/[name]/[version]/tarball",
  async (request: Request, { params }: Context) => {
    await connection();
    return getTarball(request, await params);
  },
);

/** The same headers, without the body or a count. */
export const HEAD = apiRoute(
  "/api/v1/workspaces/[workspace]/items/[scope]/[name]/[version]/tarball",
  async (request: Request, { params }: Context) => {
    await connection();
    return getTarball(request, await params);
  },
);
