"use server";

import { revalidatePath } from "next/cache";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { type PublishInput, publishSubmission } from "@/server/domains/submissions/actions/publish";
import {
  approveMany,
  comment,
  type Dependent,
  decide,
  listDependents,
  type ReviewDecision,
  rejectWithDependents,
} from "@/server/domains/submissions/actions/reviews";
import { SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { ApproveManyState, PublishResult, ReviewActionState } from "./types";

/** A revision as the page has it: a whole number from 1, or null for a submission without one. */
const isRevision = (value: unknown): value is number | null =>
  value === null || (Number.isInteger(value) && (value as number) >= 1);

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

/**
 * Approve, request changes, reject or override (feature 014); errors become the dialog's line.
 * `via: "queue"` (058) records that it was decided from a row of the review queue.
 */
export const decideAction = async (
  id: string,
  decision: ReviewDecision,
  text: string,
  via?: "queue",
  /** The revision on the reviewer's page: an approval goes only if it's still the latest. */
  revision?: number | null,
): Promise<ReviewActionState> => {
  // An approval from the web always says what was reviewed (security audit AUTHZ-2).
  if (
    (decision === "approve" || decision === "override") &&
    (revision === undefined || !isRevision(revision))
  )
    return { error: "Reload the page: it doesn't say which revision you reviewed." };
  try {
    await decide(await requestHeaders(), id, {
      decision,
      message: text,
      ...(via ? { via } : {}),
      ...(revision !== undefined ? { revision } : {}),
    });
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
  via?: "queue",
): Promise<ReviewActionState & { skipped?: { name: string; reason: string }[] }> => {
  let skipped: { name: string; reason: string }[] = [];
  try {
    const result = await rejectWithDependents(await requestHeaders(), id, {
      message: text,
      ...(dependentsText !== null ? { dependents: { message: dependentsText } } : {}),
      ...(via ? { via } : {}),
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

/**
 * The open submissions that depend on this one (056), for a queue row's reject dialog (058): loaded
 * when it opens, not for every row.
 */
export const dependentsAction = async (
  id: string,
): Promise<{ dependents: Dependent[] } | { error: string }> => {
  try {
    return { dependents: await listDependents(await requestHeaders(), id) };
  } catch (error) {
    return { error: message(error) };
  }
};

/** Approves the selected submissions (054), each on its own, with one optional message. */
export const approveSelectedAction = async (
  /** Each with the revision its row showed (security audit AUTHZ-2). */
  items: { id: string; revision: number | null }[],
  text: string,
): Promise<ApproveManyState> => {
  if (
    !Array.isArray(items) ||
    !items.every((item) => typeof item?.id === "string" && isRevision(item.revision))
  )
    return { error: "Reload the page: it doesn't say which revision each one is at." };
  let approved: Awaited<ReturnType<typeof approveMany>>;
  try {
    approved = await approveMany(await requestHeaders(), { items, message: text });
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
    return {
      ok: true,
      version: published.version,
      tag: published.tag,
      sha256: published.sha256,
      with: published.with.map((member) => ({ name: member.name, version: member.version })),
    };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
};
