"use server";

import { revalidatePath } from "next/cache";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { setUsageMinimum, setUsagePolicy } from "@/server/domains/settings/actions/settings";
import { SettingsError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { SettingsActionState } from "./types";

/** Saves the usage policy (feature 046), turning domain errors into the form's `ERR:` line. */
export const saveUsagePolicy = async (
  _previous: SettingsActionState,
  form: FormData,
): Promise<SettingsActionState> => {
  try {
    const { changed } = await setUsagePolicy(await requestHeaders(), form.get("usagePolicy"));
    revalidatePath("/admin/settings");
    return { done: changed ? "Usage reporting saved." : "Nothing changed." };
  } catch (error) {
    if (error instanceof SettingsError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};

/** Saves the usage minimum (047), turning domain errors into the form's `ERR:` line. */
export const saveUsageMinimum = async (
  _previous: SettingsActionState,
  form: FormData,
): Promise<SettingsActionState> => {
  try {
    const { changed } = await setUsageMinimum(await requestHeaders(), form.get("usageMinimum"));
    revalidatePath("/admin/settings");
    return { done: changed ? "Usage minimum saved." : "Nothing changed." };
  } catch (error) {
    if (error instanceof SettingsError || error instanceof IdentityError)
      return { error: error.message };
    throw error;
  }
};
