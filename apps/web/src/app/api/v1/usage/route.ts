import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getUsage, postUsage } from "@/server/http/usage-api";

/** Whether this instance accepts usage reports from `rmk` (feature 046). */
export const GET = apiRoute("/api/v1/usage", async (request: Request) => {
  await connection();
  return getUsage(request);
});

/** Daily counts of installs, removals and runs, from machines that turned reporting on (046). */
export const POST = apiRoute("/api/v1/usage", async (request: Request) => {
  await connection();
  return postUsage(request);
});
