import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { putDraft } from "@/server/http/drafts-api";

/** Replace your draft's files with an upload of the same item (feature 051). */
export const PUT = apiRoute(
  "/api/v1/drafts/[id]",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await connection();
    return putDraft(request, await params);
  },
);
