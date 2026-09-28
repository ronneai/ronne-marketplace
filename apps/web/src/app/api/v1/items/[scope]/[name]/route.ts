import { connection } from "next/server";
import { getItem } from "@/server/http/registry-api";

/** An item, its dist-tags and its versions (feature 019). */
export const GET = async (
  request: Request,
  { params }: { params: Promise<{ scope: string; name: string }> },
) => {
  await connection();
  return getItem(request, await params);
};
