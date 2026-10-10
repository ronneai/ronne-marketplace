import { connection } from "next/server";
import { getPluginZip } from "@/server/http/feeds-api";

type Context = {
  params: Promise<{ tool: string; workspace: string; scope: string; name: string; file: string }>;
};

/** A workspace's item's plugin zip (077, 118: `global`'s are at /plugins). */
export const GET = async (request: Request, { params }: Context) => {
  await connection();
  return getPluginZip(request, await params);
};

/** The same headers, without the body or a count. */
export const HEAD = async (request: Request, { params }: Context) => {
  await connection();
  return getPluginZip(request, await params);
};
