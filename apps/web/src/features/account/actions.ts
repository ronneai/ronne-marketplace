"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOCALE_COOKIE, localeCookieOptions } from "@/i18n/locale";
import { changePassword, setLocale, signOut } from "@/server/domains/identity/actions/session";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { ChangePasswordFormState, LanguageFormState } from "./types";

/** The change-password form's server action. It works without JavaScript. */
export const changePasswordFromForm = serverAction(
  async (_previous: ChangePasswordFormState, form: FormData): Promise<ChangePasswordFormState> => {
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) return { error: "mismatch" };
    const result = await changePassword(await requestHeaders(), {
      current: String(form.get("current") ?? ""),
      next,
    });
    if (result.ok) return { changed: true };
    if (result.error === "not_signed_in") redirect(SIGN_IN_PATH);
    return { error: result.error };
  },
);

/** The user menu's "Sign out". */
export const signOutFromMenu = serverAction(
  async () => {
    await signOut(await requestHeaders());
    redirect(SIGN_IN_PATH);
  },
  // Someone held for two-factor (105) can still sign out.
  { whileHeld: true },
);

/**
 * The Language form's server action (feature 129). Saves the choice on the profile, and in the
 * `ronne-locale` cookie, so the sign-in page on this browser follows it too; Automatic clears
 * both. It works without JavaScript: the page comes back in the new language.
 */
export const setLanguageFromForm = serverAction(
  async (_previous: LanguageFormState, form: FormData): Promise<LanguageFormState> => {
    const chosen = String(form.get("language") ?? "");
    const result = await setLocale(await requestHeaders(), chosen === "" ? null : chosen);
    if (!result.ok) {
      if (result.error === "not_signed_in") redirect(SIGN_IN_PATH);
      return { error: "invalid" };
    }
    const jar = await cookies();
    if (result.locale) jar.set(LOCALE_COOKIE, result.locale, localeCookieOptions);
    else jar.delete(LOCALE_COOKIE);
    revalidatePath("/", "layout");
    return { saved: result.locale ?? "automatic" };
  },
);
