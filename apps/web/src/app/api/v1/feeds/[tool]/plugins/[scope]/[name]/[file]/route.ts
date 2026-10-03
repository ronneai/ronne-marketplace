import { connection } from "next/server";
import { getPluginZip } from "@/server/http/feeds-api";

type Context = { params: Promise<{ tool: string; scope: string; name: string; file: string }> };

/** A version's plugin zip, with its sha256 as the ETag; each GET is counted (feature 077). */
export const GET = async (request: Request, { params }: Context) => {
  await connection();
  return getPluginZip(request, await params);
};

/** The same headers, without the body or a count. */
export const HEAD = async (request: Request, { params }: Context) => {
  await connection();
  return getPluginZip(request, await params);
};
