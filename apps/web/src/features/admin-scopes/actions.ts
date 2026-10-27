"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { errorText } from "@/i18n/errors";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { createScope, updateScopeDescription } from "@/server/domains/items/actions/scopes";
import { ItemsError } from "@/server/domains/items/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { ScopeActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Runs a scope change, turning domain errors into the dialog's `ERR:` line. */
const attempt = async (work: () => Promise<string>): Promise<ScopeActionState> => {
  try {
    const done = await work();
    // A workspace's page lists its scopes (090, under Workspaces since 115), and its list counts them.
    revalidatePath("/workspaces", "layout");
    return { done };
  } catch (error) {
    if (error instanceof ItemsError || error instanceof IdentityError)
      return { error: await errorText(error) };
    throw error;
  }
};

export const createScopeFromForm = serverAction(
  async (_previous: ScopeActionState, form: FormData): Promise<ScopeActionState> =>
    attempt(async () => {
      const scope = await createScope(await requestHeaders(), {
        name: text(form, "name"),
        description: text(form, "description"),
        workspaceId: text(form, "workspaceId") || undefined,
      });
      const t = await getTranslations("admin.done.scopes");
      return scope.workspace.name === "global"
        ? t("created", { name: scope.name })
        : t("createdIn", { name: scope.name, workspace: scope.workspace.name });
    }),
);

export const updateScopeFromForm = serverAction(
  async (_previous: ScopeActionState, form: FormData): Promise<ScopeActionState> =>
    attempt(async () => {
      await updateScopeDescription(await requestHeaders(), {
        name: text(form, "name"),
        description: text(form, "description"),
      });
      return (await getTranslations("admin.done.scopes"))("descriptionSaved");
    }),
);
