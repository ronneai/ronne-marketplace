"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { setLanguagePolicy } from "@/server/domains/settings/actions/settings";
import { SettingsError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { LanguagesFormState } from "./types";

/**
 * Saves the languages (141). The whole layout is revalidated: the language of every screen may
 * have changed, root's own included.
 */
export const saveLanguages = serverAction(
  async (_previous: LanguagesFormState, form: FormData): Promise<LanguagesFormState> => {
    try {
      const { changed } = await setLanguagePolicy(await requestHeaders(), {
        default: form.get("default"),
        choice: form.get("choice") === "on",
        offered: form.getAll("offered"),
      });
      revalidatePath("/", "layout");
      return { done: changed ? "saved" : "unchanged" };
    } catch (error) {
      if (error instanceof SettingsError) return { error: await errorText(error) };
      throw error;
    }
  },
);
