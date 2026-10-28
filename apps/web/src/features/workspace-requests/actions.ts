"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { workspacePath } from "@/features/admin-workspaces/list";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  approveAccessRequest,
  approveItemMove,
  approveScopeMove,
  declineAccessRequest,
  declineItemMove,
  declineScopeMove,
} from "@/server/domains/workspaces/actions/workspaces";
import {
  ItemMoveRefusedError,
  ScopeMoveRefusedError,
  WorkspacesError,
} from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { AnswerState, ItemMoveAnswerState, MoveAnswerState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/**
 * Runs an answer, turning domain errors into the form's error line (094). The whole layout is
 * refreshed: the nav's Requests count changes with every answer.
 */
const attempt = async (form: FormData, work: () => Promise<string>): Promise<AnswerState> => {
  try {
    const done = await work();
    revalidatePath("/", "layout");
    revalidatePath(workspacePath(text(form, "workspace")));
    return { done };
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: await errorText(error) };
    throw error;
  }
};

export const approveRequestFromForm = serverAction(
  async (_previous: AnswerState, form: FormData): Promise<AnswerState> =>
    attempt(form, async () => {
      const role = text(form, "role") || "user";
      await approveAccessRequest(await requestHeaders(), {
        requestId: text(form, "requestId"),
        role,
      });
      const roles = await getTranslations("common.roles");
      return (await getTranslations("workspaces.results"))("approved", {
        workspace: text(form, "workspace"),
        role: role === "moderator" || role === "user" ? roles(role) : role,
      });
    }),
);

export const declineRequestFromForm = serverAction(
  async (_previous: AnswerState, form: FormData): Promise<AnswerState> =>
    attempt(form, async () => {
      await declineAccessRequest(await requestHeaders(), {
        requestId: text(form, "requestId"),
        reason: text(form, "reason"),
      });
      return (await getTranslations("workspaces.results"))("declined");
    }),
);

/**
 * Approves a scope move (115): checked again, then moved; or what refuses it now, leaving it open.
 * A move changes every page that names the scope's items.
 */
export const approveMoveFromForm = serverAction(
  async (_previous: MoveAnswerState, form: FormData): Promise<MoveAnswerState> => {
    try {
      await approveScopeMove(await requestHeaders(), { moveId: text(form, "moveId") });
    } catch (error) {
      // What refuses it now, listed; anything else (answered already, the asker lost their role)
      // as its message.
      if (error instanceof ScopeMoveRefusedError) return { refused: error.impact };
      if (error instanceof WorkspacesError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
    revalidatePath("/", "layout");
    return {
      done: (await getTranslations("workspaces.results"))("moved", {
        workspace: text(form, "workspace"),
      }),
    };
  },
);

/** Declines a scope move, with an optional reason its asker sees on the scope's row (115). */
export const declineMoveFromForm = serverAction(
  async (_previous: MoveAnswerState, form: FormData): Promise<MoveAnswerState> =>
    attempt(form, async () => {
      await declineScopeMove(await requestHeaders(), {
        moveId: text(form, "moveId"),
        reason: text(form, "reason"),
      });
      return (await getTranslations("workspaces.results"))("declined");
    }),
);

/**
 * Approves an item move (134): the name checked again, then moved; or why it's taken now, leaving
 * the request open. A move changes every page that names the item.
 */
export const approveItemMoveFromForm = serverAction(
  async (_previous: ItemMoveAnswerState, form: FormData): Promise<ItemMoveAnswerState> => {
    let newName: string;
    try {
      const result = await approveItemMove(await requestHeaders(), {
        moveId: text(form, "moveId"),
      });
      newName = result.impact.newName;
    } catch (error) {
      // Why the name is taken now; anything else (answered already, the asker gone, the scope in
      // another workspace) as its message.
      if (error instanceof ItemMoveRefusedError) return { refused: error.impact };
      if (error instanceof WorkspacesError || error instanceof IdentityError)
        return { error: await errorText(error) };
      throw error;
    }
    revalidatePath("/", "layout");
    return { done: (await getTranslations("workspaces.results"))("itemMoved", { newName }) };
  },
);

/** Declines an item move, with an optional reason its asker sees on the item's page (134). */
export const declineItemMoveFromForm = serverAction(
  async (_previous: ItemMoveAnswerState, form: FormData): Promise<ItemMoveAnswerState> =>
    attempt(form, async () => {
      await declineItemMove(await requestHeaders(), {
        moveId: text(form, "moveId"),
        reason: text(form, "reason"),
      });
      return (await getTranslations("workspaces.results"))("declined");
    }),
);
