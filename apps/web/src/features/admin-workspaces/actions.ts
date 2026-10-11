"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  askScopeMove,
  cancelScopeMove,
  createWorkspace,
  deleteWorkspace,
  moveImpact,
  moveTargets,
  renameImpact,
  renameWorkspace,
  setWorkspaceVisibility,
  updateWorkspace,
  visibilityImpact,
} from "@/server/domains/workspaces/actions/workspaces";
import {
  ScopeMoveRefusedError,
  WorkspacesError,
} from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { workspacePath } from "./list";
import type {
  MoveActionState,
  MoveImpactResult,
  MoveTargetsResult,
  RenameImpactResult,
  VisibilityImpactResult,
  WorkspaceActionState,
} from "./types";

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

/** Root makes a workspace private or public (093); every page that lists items changes with it. */
export const setVisibilityFromForm = async (
  _previous: WorkspaceActionState,
  form: FormData,
): Promise<WorkspaceActionState> =>
  attempt(async () => {
    const visibility = text(form, "visibility");
    await setWorkspaceVisibility(await requestHeaders(), { name: text(form, "name"), visibility });
    // What everyone sees changes: the catalogue, item pages, every list.
    revalidatePath("/", "layout");
    return visibility === "private"
      ? "It's private: only its members and root see its items."
      : "It's public: everyone signed in sees its items.";
  }, ["/admin/workspaces", workspacePath(text(form, "name"))]);

/** What Make private would meet (093), for its dialog. */
export const visibilityImpactFor = async (name: string): Promise<VisibilityImpactResult> => {
  try {
    return await visibilityImpact(await requestHeaders(), name);
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

/**
 * Renames a workspace (113), then goes to its new address: the old one answers as unknown. Every
 * page that names its items changes with it.
 */
export const renameWorkspaceFromForm = async (
  _previous: WorkspaceActionState,
  form: FormData,
): Promise<WorkspaceActionState> => {
  let to = "";
  const state = await attempt(async () => {
    const workspace = await renameWorkspace(await requestHeaders(), {
      name: text(form, "name"),
      to: text(form, "to"),
    });
    to = workspace.name;
    revalidatePath("/", "layout");
    return `Renamed to ${workspace.name}.`;
  }, ["/admin/workspaces"]);
  if (state.done) redirect(workspacePath(to));
  return state;
};

/** How many items a rename would give the new name (113), for its dialog. */
export const renameImpactFor = async (name: string): Promise<RenameImpactResult> => {
  try {
    return await renameImpact(await requestHeaders(), name);
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

/** A domain refusal as the dialog's error, anything else thrown on. */
const refusal = (error: unknown) => {
  if (error instanceof WorkspacesError || error instanceof IdentityError)
    return { error: error.message };
  throw error;
};

/** Where a scope could move (115), for the Move dialog's select. */
export const moveTargetsFor = async (scopeId: string): Promise<MoveTargetsResult> => {
  try {
    return { targets: await moveTargets(await requestHeaders(), { scopeId }) };
  } catch (error) {
    return refusal(error);
  }
};

/** What moving the scope to `to`, named `name` there, would change and how (115). */
export const moveImpactFor = async (input: {
  scopeId: string;
  to: string;
  name?: string;
}): Promise<MoveImpactResult> => {
  try {
    return await moveImpact(await requestHeaders(), input);
  } catch (error) {
    return refusal(error);
  }
};

/**
 * Moves a scope, or asks to (115): its workspace's page, and the target's, change with it; a move
 * changes every page that names its items.
 */
export const askMoveFromForm = async (
  _previous: MoveActionState,
  form: FormData,
): Promise<MoveActionState> => {
  try {
    const result = await askScopeMove(await requestHeaders(), {
      scopeId: text(form, "scopeId"),
      to: text(form, "to"),
      name: text(form, "name"),
      message: text(form, "message"),
      confirm: form.has("confirm") ? text(form, "confirm") : undefined,
    });
    if (result.outcome === "moved") revalidatePath("/", "layout");
    else revalidatePath(workspacePath(text(form, "workspace")));
    return { done: result.outcome };
  } catch (error) {
    if (error instanceof ScopeMoveRefusedError) return { refused: error.impact };
    return refusal(error);
  }
};

/** Cancels a move request (115), from its scope's row. */
export const cancelMoveFromForm = async (
  _previous: WorkspaceActionState,
  form: FormData,
): Promise<WorkspaceActionState> =>
  attempt(async () => {
    await cancelScopeMove(await requestHeaders(), { moveId: text(form, "moveId") });
    return "Cancelled.";
  }, [workspacePath(text(form, "workspace")), "/workspaces/requests"]);
