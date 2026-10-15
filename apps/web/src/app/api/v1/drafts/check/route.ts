import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { checkDrafts } from "@/server/http/drafts-api";

/** Whether Submit would take each of your drafts, without submitting (feature 052). */
export const POST = apiRoute("/api/v1/drafts/check", async (request: Request) => {
  await connection();
  return checkDrafts(request);
});
