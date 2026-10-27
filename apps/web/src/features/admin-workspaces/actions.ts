"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { errorText } from "@/i18n/errors";
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
import { serverAction } from "@/server/http/server-action";
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
      return { error: await errorText(error) };
    throw error;
  }
};

export const createWorkspaceFromForm = serverAction(
  async (_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> =>
    attempt(async () => {
      const workspace = await createWorkspace(await requestHeaders(), {
        name: text(form, "name"),
        description: text(form, "description"),
        visibility: text(form, "visibility"),
      });
      return (await getTranslations("admin.done.workspaces"))("created", { name: workspace.name });
    }, ["/workspaces"]),
);

export const updateWorkspaceFromForm = serverAction(
  async (_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> =>
    attempt(async () => {
      await updateWorkspace(await requestHeaders(), {
        name: text(form, "name"),
        description: text(form, "description"),
      });
      return (await getTranslations("admin.done.workspaces"))("descriptionSaved");
    }, ["/workspaces", workspacePath(text(form, "name"))]),
);

/** Deletes an empty workspace, then goes back to the list: its own page no longer exists. */
export const deleteWorkspaceFromForm = serverAction(
  async (_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> => {
    const state = await attempt(async () => {
      await deleteWorkspace(await requestHeaders(), { name: text(form, "name") });
      return (await getTranslations("admin.done.workspaces"))("deleted");
    }, ["/workspaces"]);
    if (state.done) redirect("/workspaces");
    return state;
  },
);

/** Root makes a workspace private or public (093); every page that lists items changes with it. */
export const setVisibilityFromForm = serverAction(
  async (_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> =>
    attempt(async () => {
      const visibility = text(form, "visibility");
      await setWorkspaceVisibility(await requestHeaders(), {
        name: text(form, "name"),
        visibility,
      });
      // What everyone sees changes: the catalogue, item pages, every list.
      revalidatePath("/", "layout");
      const t = await getTranslations("admin.done.workspaces");
      return visibility === "private" ? t("private") : t("public");
    }, ["/workspaces", workspacePath(text(form, "name"))]),
);

/** What Make private would meet (093), for its dialog. */
export const visibilityImpactFor = serverAction(
  async (name: string): Promise<VisibilityImpactResult> => {
    try {
      return await visibilityImpact(await requestHeaders(), name);
    } catch (error) {
      if (error instanceof WorkspacesError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
  },
);

/**
 * Renames a workspace (113), then goes to its new address: the old one answers as unknown. Every
 * page that names its items changes with it.
 */
export const renameWorkspaceFromForm = serverAction(
  async (_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> => {
    let to = "";
    const state = await attempt(async () => {
      const workspace = await renameWorkspace(await requestHeaders(), {
        name: text(form, "name"),
        to: text(form, "to"),
      });
      to = workspace.name;
      revalidatePath("/", "layout");
      return (await getTranslations("admin.done.workspaces"))("renamed", { name: workspace.name });
    }, ["/workspaces"]);
    if (state.done) redirect(workspacePath(to));
    return state;
  },
);

/** How many items a rename would give the new name (113), for its dialog. */
export const renameImpactFor = serverAction(async (name: string): Promise<RenameImpactResult> => {
  try {
    return await renameImpact(await requestHeaders(), name);
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: await errorText(error) };
    throw error;
  }
});

/** A domain refusal as the dialog's error, anything else thrown on. */
const refusal = async (error: unknown) => {
  if (error instanceof WorkspacesError || error instanceof IdentityError)
    return { error: await errorText(error) };
  throw error;
};

/** Where a scope could move (115), for the Move dialog's select. */
export const moveTargetsFor = serverAction(async (scopeId: string): Promise<MoveTargetsResult> => {
  try {
    return { targets: await moveTargets(await requestHeaders(), { scopeId }) };
  } catch (error) {
    return await refusal(error);
  }
});

/** What moving the scope to `to`, named `name` there, would change and how (115). */
export const moveImpactFor = serverAction(
  async (input: { scopeId: string; to: string; name?: string }): Promise<MoveImpactResult> => {
    try {
      return await moveImpact(await requestHeaders(), input);
    } catch (error) {
      return await refusal(error);
    }
  },
);

/**
 * Moves a scope, or asks to (115). Nothing is refreshed here: the page would redraw under the
 * dialog, which closes with its row (a moved scope leaves the page). The dialog refreshes the page
 * when it's closed, as Submit's does.
 */
export const askMoveFromForm = serverAction(
  async (_previous: MoveActionState, form: FormData): Promise<MoveActionState> => {
    try {
      const result = await askScopeMove(await requestHeaders(), {
        scopeId: text(form, "scopeId"),
        to: text(form, "to"),
        name: text(form, "name"),
        message: text(form, "message"),
        confirm: form.has("confirm") ? text(form, "confirm") : undefined,
      });
      return { done: result.outcome };
    } catch (error) {
      if (error instanceof ScopeMoveRefusedError) return { refused: error.impact };
      return await refusal(error);
    }
  },
);

/** Cancels a move request (115), from its scope's row. */
export const cancelMoveFromForm = serverAction(
  async (_previous: WorkspaceActionState, form: FormData): Promise<WorkspaceActionState> =>
    attempt(async () => {
      await cancelScopeMove(await requestHeaders(), { moveId: text(form, "moveId") });
      return (await getTranslations("admin.done.workspaces"))("cancelled");
    }, [workspacePath(text(form, "workspace")), "/workspaces/requests"]),
);
