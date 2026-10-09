"use server";

import { revalidatePath } from "next/cache";
import { workspacePath } from "@/features/admin-workspaces/list";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  approveAccessRequest,
  declineAccessRequest,
} from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { AnswerState } from "./types";

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

export const approveRequestFromForm = async (
  _previous: AnswerState,
  form: FormData,
): Promise<AnswerState> =>
  attempt(form, async () => {
    const role = text(form, "role") || "user";
    await approveAccessRequest(await requestHeaders(), {
      requestId: text(form, "requestId"),
      role,
    });
    return `Approved: they're in ${text(form, "workspace")} as ${role}.`;
  });

export const declineRequestFromForm = async (
  _previous: AnswerState,
  form: FormData,
): Promise<AnswerState> =>
  attempt(form, async () => {
    await declineAccessRequest(await requestHeaders(), {
      requestId: text(form, "requestId"),
      reason: text(form, "reason"),
    });
    return "Declined.";
  });
