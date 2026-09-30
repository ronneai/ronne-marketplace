import { connection } from "next/server";
import { getScopes } from "@/server/http/drafts-api";

/** The scopes a draft can be created in (feature 037). */
export const GET = async (request: Request) => {
  await connection();
  return getScopes(request);
};
