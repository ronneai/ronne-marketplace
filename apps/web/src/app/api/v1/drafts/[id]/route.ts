import { connection } from "next/server";
import { putDraft } from "@/server/http/drafts-api";

/** Replace your draft's files with an upload of the same item (feature 051). */
export const PUT = async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await connection();
  return putDraft(request, await params);
};
