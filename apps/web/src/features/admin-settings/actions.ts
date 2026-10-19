"use server";

import { revalidatePath } from "next/cache";
import { adminRetryErasures } from "@/server/domains/identity/actions/erase-user";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import {
  setPasswordSignInPolicy,
  setRetention,
  setTwoFactorPolicy,
  setUsageMinimum,
  setUsagePolicy,
} from "@/server/domains/settings/actions/settings";
import { SettingsError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { SettingsActionState } from "./types";

/** Saves the usage policy (feature 046), turning domain errors into the form's `ERR:` line. */
export const saveUsagePolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setUsagePolicy(await requestHeaders(), form.get("usagePolicy"));
      revalidatePath("/admin/settings");
      return { done: changed ? "Usage reporting saved." : "Nothing changed." };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: error.message };
      throw error;
    }
  },
);

/** Saves the usage minimum (047), turning domain errors into the form's `ERR:` line. */
export const saveUsageMinimum = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setUsageMinimum(await requestHeaders(), form.get("usageMinimum"));
      revalidatePath("/admin/settings");
      return { done: changed ? "Usage minimum saved." : "Nothing changed." };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: error.message };
      throw error;
    }
  },
);

/** Saves who must use two-factor sign-in (105), turning domain errors into the form's `ERR:` line. */
export const saveTwoFactorPolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setTwoFactorPolicy(
        await requestHeaders(),
        form.get("twoFactorPolicy"),
      );
      revalidatePath("/admin/settings");
      return { done: changed ? "Two-factor sign-in saved." : "Nothing changed." };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: error.message };
      throw error;
    }
  },
);

/** Saves how long personal data is kept (102), turning domain errors into the form's `ERR:` line. */
export const saveRetention = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setRetention(await requestHeaders(), {
        ipDays: form.get("ipDays"),
        sessionsDays: form.get("sessionsDays"),
      });
      revalidatePath("/admin/settings");
      return { done: changed ? "Retention saved." : "Nothing changed." };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: error.message };
      throw error;
    }
  },
);

/** Saves who may sign in with a password (106), turning domain errors into the form's `ERR:` line. */
export const savePasswordSignInPolicy = serverAction(
  async (_previous: SettingsActionState, form: FormData): Promise<SettingsActionState> => {
    try {
      const { changed } = await setPasswordSignInPolicy(
        await requestHeaders(),
        form.get("passwordSignInPolicy"),
        form.get("confirm") === "on",
      );
      revalidatePath("/admin/settings");
      return { done: changed ? "Password sign-in saved." : "Nothing changed." };
    } catch (error) {
      if (error instanceof SettingsError || error instanceof IdentityError)
        return { error: error.message };
      throw error;
    }
  },
);

/** Finishes the erasures whose audit log rewrite wasn't completed (103), from the Privacy tab's Retry. */
export const retryErasures = serverAction(
  async (_previous: SettingsActionState, _form: FormData): Promise<SettingsActionState> => {
    try {
      const finished = await adminRetryErasures(await requestHeaders());
      revalidatePath("/admin/settings");
      return {
        done:
          finished === 0
            ? "Nothing was left to finish."
            : `Finished ${finished} ${finished === 1 ? "erasure" : "erasures"}.`,
      };
    } catch (error) {
      if (error instanceof IdentityError) return { error: error.message };
      throw error;
    }
  },
);
