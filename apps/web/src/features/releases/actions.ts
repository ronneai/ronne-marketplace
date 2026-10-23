"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  type PreparedRelease,
  prepareRelease,
  type ReleasedSubmission,
  type ReleaseSettings,
  releaseMany,
} from "@/server/domains/submissions/actions/publish";
import { SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";

export type PrepareResult = ({ ok: true } & PreparedRelease) | { ok: false; error: string };
export type ReleaseResult =
  | { ok: true; results: ReleasedSubmission[] }
  | { ok: false; error: string };

const failure = async (error: unknown) => {
  if (error instanceof SubmissionsError || error instanceof IdentityError)
    return { ok: false as const, error: await errorText(error) };
  throw error;
};

/** What releasing the selection would do (055): the order, the dependencies added, what can't go. */
export const prepareReleaseAction = serverAction(async (ids: string[]): Promise<PrepareResult> => {
  try {
    return { ok: true, ...(await prepareRelease(await requestHeaders(), { ids })) };
  } catch (error) {
    return await failure(error);
  }
});

/** Releases the selection with one set of settings, each on its own, dependencies first (055). */
export const releaseSelectedAction = serverAction(
  async (ids: string[], settings: ReleaseSettings, notes: string): Promise<ReleaseResult> => {
    try {
      const results = await releaseMany(await requestHeaders(), { ids, settings, notes });
      revalidatePath("/submissions");
      revalidatePath("/reviews");
      return { ok: true, results };
    } catch (error) {
      return await failure(error);
    }
  },
);
