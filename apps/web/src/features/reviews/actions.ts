"use server";

import { revalidatePath } from "next/cache";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { type PublishInput, publishSubmission } from "@/server/domains/submissions/actions/publish";
import {
  approveMany,
  comment,
  decide,
  type ReviewDecision,
  rejectWithDependents,
} from "@/server/domains/submissions/actions/reviews";
import { SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { ApproveManyState, PublishResult, ReviewActionState } from "./types";

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

/**
 * Rejects (014), and with `dependentsText` (056) requests changes on the open submissions that
 * depend on it, with that message. Ones it couldn't send back come back with why.
 */
export const rejectAction = async (
  id: string,
  text: string,
  dependentsText: string | null,
): Promise<ReviewActionState & { skipped?: { name: string; reason: string }[] }> => {
  let skipped: { name: string; reason: string }[] = [];
  try {
    const result = await rejectWithDependents(await requestHeaders(), id, {
      message: text,
      ...(dependentsText !== null ? { dependents: { message: dependentsText } } : {}),
    });
    for (const d of result.dependents) if (d.result === "sent_back") refresh(d.id);
    skipped = result.dependents.flatMap((d) =>
      d.result === "skipped" ? [{ name: d.name, reason: d.reason ?? "" }] : [],
    );
  } catch (error) {
    return { error: message(error) };
  }
  refresh(id);
  return { done: true, skipped };
};

/** Approves the selected submissions (054), each on its own, with one optional message. */
export const approveSelectedAction = async (
  ids: string[],
  text: string,
): Promise<ApproveManyState> => {
  let approved: Awaited<ReturnType<typeof approveMany>>;
  try {
    approved = await approveMany(await requestHeaders(), { ids, message: text });
  } catch (error) {
    return { error: message(error) };
  }
  for (const r of approved) if (r.result === "approved") refresh(r.id);
  return {
    results: approved.map((r) => ({
      id: r.id,
      name: "submission" in r ? `@${r.submission.scope.name}/${r.submission.name}` : r.id,
      result: r.result,
      override: r.result === "approved" && r.override,
      revision: r.result === "approved" ? r.revision : null,
      reason:
        r.result === "not_approvable"
          ? r.reason
          : r.result === "not_found"
            ? "It no longer exists, or you can't see it."
            : null,
    })),
  };
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
