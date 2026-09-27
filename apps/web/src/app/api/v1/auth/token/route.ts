import { connection } from "next/server";
import { isConfigured, loadConfig } from "@/server/config";
import { deleteToken, postToken } from "@/server/http/api-v1";
import { setupRequiredResponse } from "@/server/http/errors";

export const POST = async (request: Request) => {
  await connection();
  if (!isConfigured(loadConfig())) return setupRequiredResponse();
  return postToken(request);
};

export const DELETE = async (request: Request) => {
  await connection();
  return deleteToken(request);
};
