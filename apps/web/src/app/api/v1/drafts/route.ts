import { connection } from "next/server";
import { getDrafts, postDraft } from "@/server/http/drafts-api";

/** Your open drafts, of one item with `?name=` (feature 051). */
export const GET = async (request: Request) => {
  await connection();
  return getDrafts(request);
};

/** Create a draft of a new item with its files, as the token's user (feature 037). */
export const POST = async (request: Request) => {
  await connection();
  return postDraft(request);
};
