"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { adminSetAccountRules } from "@/server/domains/settings/actions/account-rules";
import { SettingsError, StaleAccountRulesError } from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import { accountRulesInputFrom } from "./input";
import type { AccountRulesFormState } from "./types";

/** Saves the block list and the throwaway setting (191). */
export const saveAccountRules = serverAction(
  async (_previous: AccountRulesFormState, form: FormData): Promise<AccountRulesFormState> => {
    try {
      const { changed } = await adminSetAccountRules(
        await requestHeaders(),
        accountRulesInputFrom(form),
      );
      revalidatePath("/admin/settings");
      return { done: changed ? "saved" : "unchanged" };
    } catch (error) {
      if (error instanceof SettingsError)
        return {
          error: await errorText(error),
          ...(error instanceof StaleAccountRulesError ? { stale: true } : {}),
        };
      throw error;
    }
  },
);
