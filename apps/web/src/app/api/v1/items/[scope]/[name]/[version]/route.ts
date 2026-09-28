import { connection } from "next/server";
import { getVersion } from "@/server/http/registry-api";

/** One version's manifest, dependencies, files and risk flags (feature 019). */
export const GET = async (
  request: Request,
  { params }: { params: Promise<{ scope: string; name: string; version: string }> },
) => {
  await connection();
  return getVersion(request, await params);
};
