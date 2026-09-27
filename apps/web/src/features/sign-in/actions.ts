"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/server/domains/identity/actions/session";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import type { SignInFormState } from "./types";

/** The sign-in form's server action. It works without JavaScript: the form posts here directly. */
export async function signInFromForm(
  _previous: SignInFormState,
  form: FormData,
): Promise<SignInFormState> {
  const email = String(form.get("email") ?? "");
  const result = await signIn(await headers(), {
    email,
    password: String(form.get("password") ?? ""),
    rememberMe: form.get("remember") === "on",
  });
  if (!result.ok) return { error: result.error, email };
  redirect(safeNextPath(String(form.get("next") ?? "")));
}
