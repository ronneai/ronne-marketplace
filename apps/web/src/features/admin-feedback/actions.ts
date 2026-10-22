"use server";

import { revalidatePath } from "next/cache";
import { deleteFeedback, markFeedbackHandled } from "@/server/domains/feedback/actions/feedback";
import { FeedbackError } from "@/server/domains/feedback/exceptions/errors";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { FeedbackBulkResult } from "./types";

/**
 * Root's bulk actions on the feedback inbox (feature 127): the ids of the rows selected, nothing
 * else. The service checks root and acts on those ids only. Not root, or too many ids, is an
 * answer, not a crash. The inbox and the sidebar's count are shown again.
 */
const run = async (
  act: (headers: Headers, ids: string[]) => Promise<string[]>,
  ids: string[],
): Promise<FeedbackBulkResult> => {
  try {
    const changed = await act(await requestHeaders(), ids);
    revalidatePath("/", "layout");
    return { ok: true, changed: changed.length };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    if (error instanceof FeedbackError) return { ok: false, error: "too_many" };
    throw error;
  }
};

export const markHandledAction = serverAction(
  async (ids: string[]): Promise<FeedbackBulkResult> => run(markFeedbackHandled, ids),
);

export const deleteFeedbackAction = serverAction(
  async (ids: string[]): Promise<FeedbackBulkResult> => run(deleteFeedback, ids),
);
