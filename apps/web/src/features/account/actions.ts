"use server";

import { redirect } from "next/navigation";
import { changePassword, signOut } from "@/server/domains/identity/actions/session";
import { SIGN_IN_PATH } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import type { ChangePasswordFormState } from "./types";

/** The change-password form's server action. It works without JavaScript. */
export const changePasswordFromForm = async (
  _previous: ChangePasswordFormState,
  form: FormData,
): Promise<ChangePasswordFormState> => {
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("confirm") ?? "")) return { error: "mismatch" };
  const result = await changePassword(await requestHeaders(), {
    current: String(form.get("current") ?? ""),
    next,
  });
  if (result.ok) return { changed: true };
  if (result.error === "not_signed_in") redirect(SIGN_IN_PATH);
  return { error: result.error };
};

/** The user menu's "Sign out". */
export const signOutFromMenu = async () => {
  await signOut(await requestHeaders());
  redirect(SIGN_IN_PATH);
};
