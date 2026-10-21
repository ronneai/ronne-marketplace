"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { joinPath } from "@/components/workspaces/join";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { cancelAccessRequest, requestAccess } from "@/server/domains/workspaces/actions/workspaces";
import { WorkspacesError } from "@/server/domains/workspaces/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { RequestActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Runs a request change, turning domain errors into the form's error line (094). */
const attempt = async (
  form: FormData,
  work: () => Promise<string>,
): Promise<RequestActionState> => {
  try {
    const done = await work();
    revalidatePath("/workspaces");
    revalidatePath(joinPath(text(form, "workspace")));
    return { done };
  } catch (error) {
    if (error instanceof WorkspacesError || error instanceof IdentityError)
      return { error: await errorText(error) };
    throw error;
  }
};

/**
 * Ask to join. "Request sent" whether the request is new or was open already, and whether the
 * name is a private workspace's or no workspace's: the answer can't tell them apart (094).
 */
export const requestAccessFromForm = serverAction(
  async (_previous: RequestActionState, form: FormData): Promise<RequestActionState> =>
    attempt(form, async () => {
      const result = await requestAccess(await requestHeaders(), {
        workspace: text(form, "workspace"),
        message: text(form, "message"),
      });
      const t = await getTranslations("workspaces.results");
      return result === "already_member" ? t("alreadyIn") : t("sent");
    }),
);

export const cancelRequestFromForm = serverAction(
  async (_previous: RequestActionState, form: FormData): Promise<RequestActionState> =>
    attempt(form, async () => {
      await cancelAccessRequest(await requestHeaders(), text(form, "requestId"));
      return (await getTranslations("workspaces.results"))("cancelled");
    }),
);
