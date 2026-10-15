import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { submitDrafts } from "@/server/http/drafts-api";

/** Submit each of your drafts that's ready (feature 052). */
export const POST = apiRoute("/api/v1/drafts/submit", async (request: Request) => {
  await connection();
  return submitDrafts(request);
});
