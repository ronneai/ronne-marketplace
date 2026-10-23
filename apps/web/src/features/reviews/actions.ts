"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorText } from "@/i18n/errors";
import { whyText } from "@/i18n/why-server";
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
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { ApproveManyState, PublishResult, ReviewActionState } from "./types";

/** A revision as the page has it: a whole number from 1, or null for a submission without one. */
const isRevision = (value: unknown): value is number | null =>
  value === null || (Number.isInteger(value) && (value as number) >= 1);

/** A domain error in the person's language (131); anything else is thrown on. */
const message = async (error: unknown): Promise<string> => {
  if (error instanceof SubmissionsError || error instanceof IdentityError) return errorText(error);
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
export const decideAction = serverAction(
  async (
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
      return { error: (await getTranslations("author.actions"))("reloadRevision") };
    try {
      await decide(await requestHeaders(), id, {
        decision,
        message: text,
        ...(via ? { via } : {}),
        ...(revision !== undefined ? { revision } : {}),
      });
    } catch (error) {
      return { error: await message(error) };
    }
    refresh(id);
    return { done: true };
  },
);

/**
 * Rejects (014), and with `dependentsText` (056) requests changes on the open submissions that
 * depend on it, with that message. Ones it couldn't send back come back with why.
 */
export const rejectAction = serverAction(
  async (
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
      skipped = await Promise.all(
        result.dependents.flatMap((d) =>
          d.result === "skipped"
            ? [
                (async () => ({
                  name: d.name,
                  reason: d.why ? await whyText(d.why) : (d.reason ?? ""),
                }))(),
              ]
            : [],
        ),
      );
    } catch (error) {
      return { error: await message(error) };
    }
    refresh(id);
    return { done: true, skipped };
  },
);

/**
 * The open submissions that depend on this one (056), for a queue row's reject dialog (058): loaded
 * when it opens, not for every row.
 */
export const dependentsAction = serverAction(
  async (id: string): Promise<{ dependents: Dependent[] } | { error: string }> => {
    try {
      return { dependents: await listDependents(await requestHeaders(), id) };
    } catch (error) {
      return { error: await message(error) };
    }
  },
);

/** Approves the selected submissions (054), each on its own, with one optional message. */
export const approveSelectedAction = serverAction(
  async (
    /** Each with the revision its row showed (security audit AUTHZ-2). */
    items: { id: string; revision: number | null }[],
    text: string,
  ): Promise<ApproveManyState> => {
    if (
      !Array.isArray(items) ||
      !items.every((item) => typeof item?.id === "string" && isRevision(item.revision))
    )
      return { error: (await getTranslations("author.actions"))("reloadRevisions") };
    let approved: Awaited<ReturnType<typeof approveMany>>;
    try {
      approved = await approveMany(await requestHeaders(), { items, message: text });
    } catch (error) {
      return { error: await message(error) };
    }
    for (const r of approved) if (r.result === "approved") refresh(r.id);
    const t = await getTranslations("author.actions");
    return {
      results: await Promise.all(
        approved.map(async (r) => ({
          id: r.id,
          name: "submission" in r ? itemNameOf(r.submission) : r.id,
          result: r.result,
          override: r.result === "approved" && r.override,
          revision: r.result === "approved" ? r.revision : null,
          reason:
            r.result === "not_approvable"
              ? await whyText(r.why)
              : r.result === "not_found"
                ? t("gone")
                : null,
        })),
      ),
    };
  },
);

/** Adds a comment from the conversation's form. */
export const commentFromForm = serverAction(
  async (id: string, _previous: ReviewActionState, form: FormData): Promise<ReviewActionState> => {
    try {
      await comment(await requestHeaders(), id, { body: String(form.get("body") ?? "") });
    } catch (error) {
      return { error: await message(error) };
    }
    refresh(id);
    return { done: true };
  },
);

/**
 * Releases an approved submission (feature 015); the dialog shows the version and sha256. It
 * doesn't revalidate: that re-renders the page at once, and the page, now `published`, no longer
 * holds the dialog, so the result would vanish. The dialog's Done refreshes the page instead.
 */
export const publishAction = serverAction(
  async (id: string, input: PublishInput): Promise<PublishResult> => {
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
      return { ok: false, error: await message(error) };
    }
  },
);
