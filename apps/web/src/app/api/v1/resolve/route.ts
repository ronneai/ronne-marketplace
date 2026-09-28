import { connection } from "next/server";
import { postResolve } from "@/server/http/registry-api";

/** Resolve a set of items to one version each (feature 020). */
export const POST = async (request: Request) => {
  await connection();
  return postResolve(request);
};
