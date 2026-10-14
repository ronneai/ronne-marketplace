import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { deleteToken, postToken } from "@/server/http/api-v1";
import { setupRequiredResponse } from "@/server/http/errors";
import { getSetupState } from "@/server/setup/state";

export const POST = apiRoute("/api/v1/auth/token", async (request: Request) => {
  await connection();
  if ((await getSetupState()) !== "ready") return setupRequiredResponse();
  return postToken(request);
});

export const DELETE = apiRoute("/api/v1/auth/token", async (request: Request) => {
  await connection();
  return deleteToken(request);
});
