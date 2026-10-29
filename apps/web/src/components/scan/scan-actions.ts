"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { dismissFinding, restoreFinding } from "@/server/domains/scans/actions/scans";
import { FindingNotFoundError, ScansError } from "@/server/domains/scans/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";

/** What marking or restoring a finding says back: nothing when it went, or why not, worded. */
export type FindingActionState = { error?: string };

/** Both pages show the scan: the reviewer's and the author's (137). */
const refresh = (submissionId: string) => {
  revalidatePath(`/reviews/${submissionId}`);
  revalidatePath(`/submissions/${submissionId}`);
};

/** Anything but an object is no request (a crafted one): said as a finding that isn't there. */
const notAnObject = async (input: unknown): Promise<FindingActionState | null> =>
  typeof input === "object" && input !== null && !Array.isArray(input)
    ? null
    : { error: await errorText(new FindingNotFoundError()) };

const worded = async (error: unknown): Promise<FindingActionState> => {
  if (error instanceof ScansError || error instanceof IdentityError)
    return { error: await errorText(error) };
  throw error;
};

/** A reviewer marks a finding a false positive or an accepted risk, with a reason (137). */
export const markFalsePositive = serverAction(
  async (input: {
    scanId: string;
    finding: number;
    reason: string;
    /** A false positive, or an accepted risk (137). */
    kind: "false_positive" | "accepted";
    submissionId: string;
  }): Promise<FindingActionState> => {
    const refused = await notAnObject(input);
    if (refused) return refused;
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
    const refused = await notAnObject(input);
    if (refused) return refused;
    try {
      await restoreFinding(await requestHeaders(), input);
      refresh(input.submissionId);
      return {};
    } catch (error) {
      return worded(error);
    }
  },
);
