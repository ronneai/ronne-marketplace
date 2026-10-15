import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getScopes } from "@/server/http/drafts-api";

/** The scopes a draft can be created in (feature 037). */
export const GET = apiRoute("/api/v1/scopes", async (request: Request) => {
  await connection();
  return getScopes(request);
});
