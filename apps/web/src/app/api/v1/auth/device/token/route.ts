import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { postDeviceToken } from "@/server/http/device-api";
import { setupRequiredResponse } from "@/server/http/errors";
import { getSetupState } from "@/server/setup/state";

export const POST = apiRoute("/api/v1/auth/device/token", async (request: Request) => {
  await connection();
  if ((await getSetupState()) !== "ready") return setupRequiredResponse();
  return postDeviceToken(request);
});
