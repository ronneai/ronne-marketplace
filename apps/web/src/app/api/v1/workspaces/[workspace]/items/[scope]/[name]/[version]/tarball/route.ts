import { connection } from "next/server";
import { getTarball } from "@/server/http/registry-api";

type Context = {
  params: Promise<{ workspace: string; scope: string; name: string; version: string }>;
};

/** A workspace's item's artifact, with its checksum; each GET is counted (019, 118). */
export const GET = async (request: Request, { params }: Context) => {
  await connection();
  return getTarball(request, await params);
};

/** The same headers, without the body or a count. */
export const HEAD = async (request: Request, { params }: Context) => {
  await connection();
  return getTarball(request, await params);
};
