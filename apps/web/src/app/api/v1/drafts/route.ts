import { connection } from "next/server";
import { postDraft } from "@/server/http/drafts-api";

/** Create a draft of a new item with its files, as the token's user (feature 037). */
export const POST = async (request: Request) => {
  await connection();
  return postDraft(request);
};
