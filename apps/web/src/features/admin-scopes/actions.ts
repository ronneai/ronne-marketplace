"use server";

import { revalidatePath } from "next/cache";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { createScope, updateScopeDescription } from "@/server/domains/items/actions/scopes";
import { ItemsError } from "@/server/domains/items/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { ScopeActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Runs a scope change, turning domain errors into the dialog's `ERR:` line. */
const attempt = async (work: () => Promise<string>): Promise<ScopeActionState> => {
  try {
    const done = await work();
    revalidatePath("/admin/scopes");
    revalidatePath("/scopes");
    return { done };
  } catch (error) {
    if (error instanceof ItemsError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

export const createScopeFromForm = async (
  _previous: ScopeActionState,
  form: FormData,
): Promise<ScopeActionState> =>
  attempt(async () => {
    const scope = await createScope(await requestHeaders(), {
      name: text(form, "name"),
      description: text(form, "description"),
    });
    return `Created @${scope.name}.`;
  });

export const updateScopeFromForm = async (
  _previous: ScopeActionState,
  form: FormData,
): Promise<ScopeActionState> =>
  attempt(async () => {
    await updateScopeDescription(await requestHeaders(), {
      name: text(form, "name"),
      description: text(form, "description"),
    });
    return "Description saved.";
  });
