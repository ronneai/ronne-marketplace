"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  deleteDraft,
  type FileWrite,
  importZip,
  renameDraft,
  saveDraftFiles,
} from "@/server/domains/submissions/actions/drafts";
import { rebaseProposal, resolveConflict } from "@/server/domains/submissions/actions/proposals";
import { countDependents } from "@/server/domains/submissions/actions/reviews";
import {
  canDeleteSubmission,
  checkSubmission,
  deleteSubmission,
  restoreSubmission,
  submitDraft,
  withdrawSubmission,
} from "@/server/domains/submissions/actions/submissions";
import {
  StaleFilesError,
  SubmissionInvalidError,
  SubmissionsError,
} from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { ActionResult, SaveResult, SubmitResult } from "./types";

/** Domain and permission errors become a message; anything else is a real failure. */
const message = (error: unknown): string => {
  if (error instanceof SubmissionsError || error instanceof IdentityError) return error.message;
  throw error;
};

type SentChanges = {
  writes: (Omit<FileWrite, "loadedAt"> & { loadedAt: string | null })[];
  deletes: { path: string; loadedAt: string | null }[];
  overwrite?: boolean;
};

const toDate = (value: string | null) => (value === null ? null : new Date(value));

/**
 * Saves the editor's changes in one transaction. It revalidates nothing: in an action, that also
 * refreshes the current page, which would remount the editor (its key is the draft's `updatedAt`)
 * and lose the cursor and undo history. /submissions reads the session, so it's never cached.
 */
export const saveDraftAction = async (id: string, changes: SentChanges): Promise<SaveResult> => {
  try {
    const { draft, issues, submitIssues, rewritten } = await saveDraftFiles(
      await requestHeaders(),
      id,
      {
        writes: changes.writes.map((file) => ({ ...file, loadedAt: toDate(file.loadedAt) })),
        deletes: changes.deletes.map((file) => ({ ...file, loadedAt: toDate(file.loadedAt) })),
        overwrite: changes.overwrite,
      },
    );
    // What was sent, and what the save changed besides (097: a skill's frontmatter, its agent).
    const written = new Set([...changes.writes.map((file) => file.path), ...rewritten]);
    return {
      ok: true,
      saved: draft.files
        .filter((file) => written.has(file.path))
        .map((file) => ({ path: file.path, loadedAt: file.updatedAt.toISOString() })),
      rewritten: draft.files
        .filter((file) => rewritten.includes(file.path))
        .map((file) => ({ path: file.path, content: file.content })),
      issues,
      submitIssues,
    };
  } catch (error) {
    if (error instanceof StaleFilesError)
      return { ok: false, error: error.message, stale: [...error.paths] };
    return { ok: false, error: message(error) };
  }
};

/** `archive` (a .zip file) and `mode` (merge or replace) from the import dialog. */
export const importZipAction = async (id: string, form: FormData): Promise<ActionResult> => {
  const archive = form.get("archive");
  if (!(archive instanceof File) || archive.size === 0)
    return { ok: false, error: "Choose a .zip file to import." };
  try {
    await importZip(await requestHeaders(), id, {
      archive: new Uint8Array(await archive.arrayBuffer()),
      mode: form.get("mode") === "replace" ? "replace" : "merge",
    });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  return { ok: true };
};

export const renameDraftAction = async (id: string, form: FormData): Promise<ActionResult> => {
  try {
    await renameDraft(await requestHeaders(), id, {
      scope: String(form.get("scope") ?? ""),
      name: String(form.get("name") ?? ""),
    });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  return { ok: true };
};

export const deleteDraftAction = async (id: string): Promise<ActionResult> => {
  try {
    await deleteDraft(await requestHeaders(), id);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath("/submissions");
  redirect("/submissions");
};

/** What submitting would say, for the confirmation dialog (feature 013). */
export const checkSubmissionAction = async (id: string): Promise<SubmitResult> => {
  try {
    return { ok: true, issues: await checkSubmission(await requestHeaders(), id) };
  } catch (error) {
    return { ok: false, error: message(error), issues: [] };
  }
};

/** Submits the saved draft for review. The page then reloads it, read-only. */
export const submitDraftAction = async (id: string): Promise<SubmitResult> => {
  try {
    const { issues } = await submitDraft(await requestHeaders(), id);
    revalidatePath(`/submissions/${id}`);
    revalidatePath("/submissions");
    return { ok: true, issues };
  } catch (error) {
    if (error instanceof SubmissionInvalidError)
      return { ok: false, error: error.message, issues: [...error.issues] };
    return { ok: false, error: message(error), issues: [] };
  }
};

/** Withdraws: archives it, or deletes it for good and goes to My submissions (057). */
export const withdrawAction = async (
  id: string,
  mode: "archive" | "delete" = "archive",
): Promise<ActionResult> => {
  try {
    await withdrawSubmission(await requestHeaders(), id, undefined, mode);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath("/submissions");
  if (mode === "delete") redirect("/submissions");
  revalidatePath(`/submissions/${id}`);
  return { ok: true };
};

/**
 * What the Withdraw dialog needs, loaded when it opens from a list or the review page (058):
 * whether it can be deleted for good, and how many open submissions depend on it (056).
 */
export const withdrawInfoAction = async (
  id: string,
): Promise<{ canDelete: boolean; dependents: number } | { error: string }> => {
  try {
    const headers = await requestHeaders();
    return {
      canDelete: await canDeleteSubmission(headers, id),
      dependents: await countDependents(headers, id),
    };
  } catch (error) {
    return { error: message(error) };
  }
};

/** Deletes an archived submission for good (057). */
export const deleteSubmissionAction = async (id: string): Promise<ActionResult> => {
  try {
    await deleteSubmission(await requestHeaders(), id);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath("/submissions");
  return { ok: true };
};

/** Brings an archived submission back as a draft (057). */
export const restoreAction = async (id: string): Promise<ActionResult> => {
  try {
    await restoreSubmission(await requestHeaders(), id);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  return { ok: true };
};

/** Rebases the proposal onto its item's newest version (017); the page reloads with the result. */
export const rebaseAction = async (id: string): Promise<ActionResult> => {
  try {
    await rebaseProposal(await requestHeaders(), id);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/submissions/${id}`);
  revalidatePath("/submissions");
  return { ok: true };
};

/** Marks one rebase conflict resolved (017). */
export const resolveConflictAction = async (id: string, path: string): Promise<ActionResult> => {
  try {
    await resolveConflict(await requestHeaders(), id, path);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  revalidatePath(`/submissions/${id}`);
  return { ok: true };
};
