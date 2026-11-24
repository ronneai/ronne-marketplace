"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { adminSetPasswordResetPolicy } from "@/server/domains/settings/actions/password-reset";
import { SettingsError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { PasswordResetFormState } from "./password-reset-types";

/** Turns reset by email on or off (194). The sign-in page's *Forgot?* follows it at once. */
export const savePasswordReset = serverAction(
  async (_previous: PasswordResetFormState, form: FormData): Promise<PasswordResetFormState> => {
    try {
      const { changed } = await adminSetPasswordResetPolicy(await requestHeaders(), {
        enabled: form.get("enabled") === "on",
      });
      revalidatePath("/", "layout");
      return { done: changed ? "saved" : "unchanged" };
    } catch (error) {
      if (error instanceof SettingsError) return { error: await errorText(error) };
      throw error;
    }
  },
);
