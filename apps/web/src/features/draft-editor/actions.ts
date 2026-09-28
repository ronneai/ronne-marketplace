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
import { StaleFilesError, SubmissionsError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { ActionResult, SaveResult } from "./types";

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
    const { draft, issues } = await saveDraftFiles(await requestHeaders(), id, {
      writes: changes.writes.map((file) => ({ ...file, loadedAt: toDate(file.loadedAt) })),
      deletes: changes.deletes.map((file) => ({ ...file, loadedAt: toDate(file.loadedAt) })),
      overwrite: changes.overwrite,
    });
    const written = new Set(changes.writes.map((file) => file.path));
    return {
      ok: true,
      saved: draft.files
        .filter((file) => written.has(file.path))
        .map((file) => ({ path: file.path, loadedAt: file.updatedAt.toISOString() })),
      issues,
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
