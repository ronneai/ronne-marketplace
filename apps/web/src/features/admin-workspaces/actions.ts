"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  createWorkspace,
  deleteWorkspace,
  updateWorkspace,
} from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { workspacePath } from "./list";
import type { WorkspaceActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Runs a workspace change, turning domain errors into the dialog's `ERR:` line. */
const attempt = async (
  work: () => Promise<string>,
  paths: string[],
): Promise<WorkspaceActionState> => {
  try {
    const done = await work();
    for (const path of paths) revalidatePath(path);
    return { done };
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

export const createWorkspaceFromForm = async (
  _previous: WorkspaceActionState,
  form: FormData,
): Promise<WorkspaceActionState> =>
  attempt(async () => {
    const workspace = await createWorkspace(await requestHeaders(), {
      name: text(form, "name"),
      description: text(form, "description"),
      visibility: text(form, "visibility"),
    });
    return `Created ${workspace.name}.`;
  }, ["/admin/workspaces"]);

export const updateWorkspaceFromForm = async (
  _previous: WorkspaceActionState,
  form: FormData,
): Promise<WorkspaceActionState> =>
  attempt(async () => {
    await updateWorkspace(await requestHeaders(), {
      name: text(form, "name"),
      description: text(form, "description"),
    });
    return "Description saved.";
  }, ["/admin/workspaces", workspacePath(text(form, "name"))]);

/** Deletes an empty workspace, then goes back to the list: its own page no longer exists. */
export const deleteWorkspaceFromForm = async (
  _previous: WorkspaceActionState,
  form: FormData,
): Promise<WorkspaceActionState> => {
  const state = await attempt(async () => {
    await deleteWorkspace(await requestHeaders(), { name: text(form, "name") });
    return "Deleted.";
  }, ["/admin/workspaces"]);
  if (state.done) redirect("/admin/workspaces");
  return state;
};
