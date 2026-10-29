"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { dismissFinding, restoreFinding } from "@/server/domains/scans/actions/scans";
import { ScansError } from "@/server/domains/scans/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";

/** What marking or restoring a finding says back: nothing when it went, or why not, worded. */
export type FindingActionState = { error?: string };

/** Both pages show the scan: the reviewer's and the author's (137). */
const refresh = (submissionId: string) => {
  revalidatePath(`/reviews/${submissionId}`);
  revalidatePath(`/submissions/${submissionId}`);
};

const worded = async (error: unknown): Promise<FindingActionState> => {
  if (error instanceof ScansError || error instanceof IdentityError)
    return { error: await errorText(error) };
  throw error;
};

/** A reviewer marks a finding a false positive, with a reason (137). */
export const markFalsePositive = serverAction(
  async (input: {
    scanId: string;
    finding: number;
    reason: string;
    submissionId: string;
  }): Promise<FindingActionState> => {
    try {
      await dismissFinding(await requestHeaders(), input);
      refresh(input.submissionId);
      return {};
    } catch (error) {
      return worded(error);
    }
  },
);

/** A reviewer takes a false-positive mark away (137). */
export const restoreFalsePositive = serverAction(
  async (input: {
    scanId: string;
    finding: number;
    submissionId: string;
  }): Promise<FindingActionState> => {
    try {
      await restoreFinding(await requestHeaders(), input);
      refresh(input.submissionId);
      return {};
    } catch (error) {
      return worded(error);
    }
  },
);
