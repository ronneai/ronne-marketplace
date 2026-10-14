import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { postResolve } from "@/server/http/registry-api";

/** Resolve a set of items to one version each (feature 020). */
export const POST = apiRoute("/api/v1/resolve", async (request: Request) => {
  await connection();
  return postResolve(request);
});
