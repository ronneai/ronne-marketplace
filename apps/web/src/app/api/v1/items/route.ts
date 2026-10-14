import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { listItems } from "@/server/http/registry-api";

/** Search the published items (feature 019). */
export const GET = apiRoute("/api/v1/items", async (request: Request) => {
  await connection();
  return listItems(request);
});
