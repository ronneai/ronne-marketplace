import { connection } from "next/server";
import { getItem } from "@/server/http/registry-api";

/** A workspace's item, its dist-tags and its versions (019, 118: `global`'s are at /items). */
export const GET = async (
  request: Request,
  { params }: { params: Promise<{ workspace: string; scope: string; name: string }> },
) => {
  await connection();
  return getItem(request, await params);
};
