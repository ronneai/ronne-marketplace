"use server";

import { revalidatePath } from "next/cache";
import { workspacePath } from "@/features/admin-workspaces/list";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  approveAccessRequest,
  approveScopeMove,
  declineAccessRequest,
  declineScopeMove,
} from "@/server/domains/workspaces/actions/workspaces";
import {
  ScopeMoveRefusedError,
  WorkspacesError,
} from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { AnswerState, MoveAnswerState } from "./types";

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
      return { error: error.message };
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
      return `Approved: they're in ${text(form, "workspace")} as ${role}.`;
    }),
);

export const declineRequestFromForm = serverAction(
  async (_previous: AnswerState, form: FormData): Promise<AnswerState> =>
    attempt(form, async () => {
      await declineAccessRequest(await requestHeaders(), {
        requestId: text(form, "requestId"),
        reason: text(form, "reason"),
      });
      return "Declined.";
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
        return { error: error.message };
      throw error;
    }
    revalidatePath("/", "layout");
    return { done: `Moved to ${text(form, "workspace")}.` };
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
      return "Declined.";
    }),
);
