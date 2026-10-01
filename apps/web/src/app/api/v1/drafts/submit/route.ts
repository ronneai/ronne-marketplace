import { connection } from "next/server";
import { submitDrafts } from "@/server/http/drafts-api";

/** Submit each of your drafts that's ready (feature 052). */
export const POST = async (request: Request) => {
  await connection();
  return submitDrafts(request);
};
