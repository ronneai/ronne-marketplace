"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn } from "@/server/domains/identity/actions/session";
import { startSsoSignIn } from "@/server/domains/identity/actions/sso";
import { completeTwoFactorSignIn } from "@/server/domains/identity/actions/two-factor";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { SignInFormState, TwoFactorStepState } from "./types";

/** The second step's address, carrying where to go (Remember me travels in Better Auth's cookie). */
const twoFactorPath = (next: string) =>
  next === "/" ? "/sign-in/two-factor" : `/sign-in/two-factor?${new URLSearchParams({ next })}`;

/** Back to the first step, saying why. */
const signInAgain = (next: string, reason: "expired" | "too_many") => {
  const query = new URLSearchParams({ reason });
  if (next !== "/") query.set("next", next);
  return `/sign-in?${query}`;
};

/** The sign-in form's server action. It works without JavaScript: the form posts here directly. */
export const signInFromForm = serverAction(
  async (_previous: SignInFormState, form: FormData): Promise<SignInFormState> => {
    const email = String(form.get("email") ?? "");
    const result = await signIn(await requestHeaders(), {
      email,
      password: String(form.get("password") ?? ""),
      rememberMe: form.get("remember") === "on",
    });
    if (!result.ok) return { error: result.error, email };
    const next = safeNextPath(String(form.get("next") ?? ""));
    // Two-factor on (105): the password was right; the code comes next, on its own page.
    if (result.twoFactor) redirect(twoFactorPath(next));
    redirect(next);
  },
  { whileHeld: true },
);

/** The second step's form (105): a code from the app, or a backup code. Works without JavaScript. */
export const twoFactorFromForm = serverAction(
  async (_previous: TwoFactorStepState, form: FormData): Promise<TwoFactorStepState> => {
    const next = safeNextPath(String(form.get("next") ?? ""));
    const result = await completeTwoFactorSignIn(await requestHeaders(), {
      code: String(form.get("code") ?? ""),
      method: form.get("method") === "backup_code" ? "backup_code" : "totp",
    });
    if (result.ok) redirect(next);
    if (result.error === "expired" || result.error === "too_many")
      redirect(signInAgain(next, result.error));
    return { error: result.error };
  },
  { whileHeld: true },
);

/**
 * A "Continue with <provider>" button (106): starts the sign-in and sends the browser to the
 * provider, with the state cookie set. Works without JavaScript: the button posts here directly.
 */
export const ssoFromForm = serverAction(
  async (form: FormData): Promise<void> => {
    const next = safeNextPath(String(form.get("next") ?? ""));
    const result = await startSsoSignIn(await requestHeaders(), {
      provider: String(form.get("provider") ?? ""),
      next,
    });
    if (!result.ok) {
      const query = new URLSearchParams({ error: result.error });
      if (next !== "/") query.set("next", next);
      redirect(`/sign-in?${query}`);
    }
    (await cookies()).set(result.cookie.name, result.cookie.value, result.cookie.options);
    redirect(result.url);
  },
  { whileHeld: true },
);
