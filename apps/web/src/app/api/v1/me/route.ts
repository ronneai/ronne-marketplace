import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getMe } from "@/server/http/api-v1";

export const GET = apiRoute("/api/v1/me", async (request: Request) => {
  await connection();
  return getMe(request);
});
