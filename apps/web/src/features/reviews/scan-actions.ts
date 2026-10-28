"use server";

import { revalidatePath } from "next/cache";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { requestScan } from "@/server/domains/scans/actions/scans";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";

/** Root's "Scan again" / "Scan now" on the review page (135): queues the revision's scan. */
export const askForScan = serverAction(
  async (
    _previous: { queued?: boolean; refused?: boolean },
    form: FormData,
  ): Promise<{ queued?: boolean; refused?: boolean }> => {
    const revisionId = form.get("revisionId");
    const submissionId = form.get("submissionId");
    if (typeof revisionId !== "string" || typeof submissionId !== "string")
      return { refused: true };
    try {
      const queued = await requestScan(await requestHeaders(), revisionId);
      revalidatePath(`/reviews/${submissionId}`);
      return queued ? { queued: true } : { refused: true };
    } catch (error) {
      if (error instanceof IdentityError) return { refused: true };
      throw error;
    }
  },
);
