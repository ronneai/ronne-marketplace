import { connection } from "next/server";
import { checkDrafts } from "@/server/http/drafts-api";

/** Whether Submit would take each of your drafts, without submitting (feature 052). */
export const POST = async (request: Request) => {
  await connection();
  return checkDrafts(request);
};
