"use server";

import { revalidatePath } from "next/cache";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { type PublishInput, publishSubmission } from "@/server/domains/submissions/actions/publish";
import { comment, decide, type ReviewDecision } from "@/server/domains/submissions/actions/reviews";
import { SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { PublishResult, ReviewActionState } from "./types";

const message = (error: unknown): string => {
  if (error instanceof SubmissionsError || error instanceof IdentityError) return error.message;
  throw error;
};

const refresh = (id: string) => {
  revalidatePath(`/reviews/${id}`);
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/reviews");
  revalidatePath("/submissions");
};

/** Approve, request changes, reject or override (feature 014); errors become the dialog's line. */
export const decideAction = async (
  id: string,
  decision: ReviewDecision,
  text: string,
): Promise<ReviewActionState> => {
  try {
    await decide(await requestHeaders(), id, { decision, message: text });
  } catch (error) {
    return { error: message(error) };
  }
  refresh(id);
  return { done: true };
};

/** Adds a comment from the conversation's form. */
export const commentFromForm = async (
  id: string,
  _previous: ReviewActionState,
  form: FormData,
): Promise<ReviewActionState> => {
  try {
    await comment(await requestHeaders(), id, { body: String(form.get("body") ?? "") });
  } catch (error) {
    return { error: message(error) };
  }
  refresh(id);
  return { done: true };
};

/**
 * Releases an approved submission (feature 015); the dialog shows the version and sha256. It
 * doesn't revalidate: that re-renders the page at once, and the page, now `published`, no longer
 * holds the dialog, so the result would vanish. The dialog's Done refreshes the page instead.
 */
export const publishAction = async (id: string, input: PublishInput): Promise<PublishResult> => {
  try {
    const published = await publishSubmission(await requestHeaders(), id, input);
    return { ok: true, version: published.version, tag: published.tag, sha256: published.sha256 };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
};
