import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getWorkspaces } from "@/server/http/api-v1";

/** The workspaces the caller sees, with their role in each (feature 095). */
export const GET = apiRoute("/api/v1/workspaces", async (request: Request) => {
  await connection();
  return getWorkspaces(request);
});
