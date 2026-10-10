import { connection } from "next/server";
import { getWorkspaces } from "@/server/http/api-v1";

/** The workspaces the caller sees, with their role in each (feature 095). */
export const GET = async (request: Request) => {
  await connection();
  return getWorkspaces(request);
};
