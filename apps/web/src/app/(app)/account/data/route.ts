import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { userDataResponse } from "@/server/http/user-data-api";

/** Your data (104): the signed-in person's own file, a link on the Account page. */
export const GET = apiRoute("/account/data", async (request: Request) => {
  await connection();
  return userDataResponse(request, null);
});

/** A HEAD or any other method downloads nothing and records nothing: the handler answers 405. */
export const HEAD = GET;
