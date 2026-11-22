"use server";

import { revalidatePath } from "next/cache";
import { errorText } from "@/i18n/errors";
import { adminSetSignUpPolicy } from "@/server/domains/settings/actions/sign-up";
import {
  InvalidSignUpSettingError,
  SettingsError,
} from "@/server/domains/settings/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import { signUpInputFrom } from "./sign-up-input";
import type { SignUpFormState } from "./sign-up-types";

/** Saves self-registration (190). The sign-in page shows or hides Create an account with it. */
export const saveSignUp = serverAction(
  async (_previous: SignUpFormState, form: FormData): Promise<SignUpFormState> => {
    try {
      const { changed } = await adminSetSignUpPolicy(await requestHeaders(), signUpInputFrom(form));
      revalidatePath("/", "layout");
      return { done: changed ? "saved" : "unchanged" };
    } catch (error) {
      if (error instanceof SettingsError)
        return {
          error: await errorText(error),
          ...(error instanceof InvalidSignUpSettingError ? { field: error.field } : {}),
        };
      throw error;
    }
  },
);
