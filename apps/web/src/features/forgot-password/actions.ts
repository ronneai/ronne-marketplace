"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadConfig } from "@/server/config";
import * as reset from "@/server/domains/identity/actions/password-reset";
import {
  resetCookieName,
  resetCookieOptions,
} from "@/server/domains/identity/models/password-reset-cookie";
import { issueChallenge } from "@/server/domains/identity/models/sign-up-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { NewPasswordState, ResetRequestState, ResetStepState } from "./types";

const config = () => {
  const { authSecret, publicUrl } = loadConfig();
  if (!authSecret) throw new Error("AUTH_SECRET isn't set");
  return { authSecret, publicUrl };
};

/** This browser's flow, from its cookie; null without one. */
const currentToken = async (): Promise<string | null> =>
  (await cookies()).get(resetCookieName(config().publicUrl))?.value ?? null;
const setToken = async (token: string) => {
  const { publicUrl } = config();
  (await cookies()).set(resetCookieName(publicUrl), token, resetCookieOptions(publicUrl));
};
/**
 * Ends it with the options it was set with: a `__Secure-` cookie is replaced (here, emptied and
 * expired) only by a `Set-Cookie` that is Secure too, which `cookies().delete` doesn't send.
 */
const clearToken = async () => {
  const { publicUrl } = config();
  (await cookies()).set(resetCookieName(publicUrl), "", {
    ...resetCookieOptions(publicUrl),
    maxAge: 0,
    expires: new Date(0),
  });
};

/** The next page of a step that passed. */
const NEXT = {
  two_factor: "/sign-in/forgot/two-factor",
  new_password: "/sign-in/forgot/new-password",
};

/**
 * The request page (194). Every address lands on the code page with the same words; only what
 * says nothing about the address is refused here (reset off, the limits, a stale form, the
 * challenge, something that isn't an address).
 */
export const requestResetFromForm = serverAction(
  async (_previous: ResetRequestState, form: FormData): Promise<ResetRequestState> => {
    const email = String(form.get("email") ?? "");
    const result = await reset.requestReset(await requestHeaders(), {
      email,
      locale: form.get("locale"),
      stamp: form.get("stamp"),
      honeypot: form.get("website"),
      challenge: form.get("challenge"),
    });
    if (result.ok) {
      await setToken(result.token);
      redirect("/sign-in/forgot/code");
    }
    if (result.refusal === "closed") redirect("/sign-in");
    return {
      error: result.refusal,
      email: email.slice(0, 255),
      ...(form.get("challengeOn") === "1"
        ? { challenge: JSON.stringify(issueChallenge(config().authSecret, new Date())) }
        : {}),
    };
  },
);

/** The code page: the six digits. */
export const resetCodeFromForm = serverAction(
  async (_previous: ResetStepState, form: FormData): Promise<ResetStepState> => {
    const result = await reset.checkResetCode(await requestHeaders(), {
      token: await currentToken(),
      code: form.get("code"),
    });
    if (result.ok) {
      await setToken(result.token);
      redirect(NEXT[result.step]);
    }
    if (result.refusal === "spent" || result.refusal === "cannot_continue") await clearToken();
    return { error: result.refusal };
  },
);

/** The two-factor page: a code from the app, or a backup code. */
export const resetTwoFactorFromForm = serverAction(
  async (_previous: ResetStepState, form: FormData): Promise<ResetStepState> => {
    const result = await reset.checkResetTwoFactor(await requestHeaders(), {
      token: await currentToken(),
      code: form.get("code"),
    });
    if (result.ok) {
      await setToken(result.token);
      redirect(NEXT[result.step]);
    }
    if (result.refusal === "spent" || result.refusal === "cannot_continue") await clearToken();
    return { error: result.refusal };
  },
);

/** The new-password page. Done: the cookie goes, and the person signs in with the new password. */
export const newPasswordFromForm = serverAction(
  async (_previous: NewPasswordState, form: FormData): Promise<NewPasswordState> => {
    const result = await reset.completeReset(await requestHeaders(), {
      token: await currentToken(),
      password: form.get("password"),
      confirm: form.get("confirm"),
      // A box: ticked unless the person unticked it (Decision 4).
      revokeTokens: form.get("revokeTokens") === "on",
    });
    if (result.ok && result.done) {
      await clearToken();
      redirect("/sign-in?reset=done");
    }
    if (result.ok) {
      await setToken(result.token);
      redirect(NEXT.two_factor);
    }
    if (
      result.refusal === "spent" ||
      result.refusal === "expired" ||
      result.refusal === "cannot_continue"
    )
      await clearToken();
    return { error: result.refusal };
  },
);

/** **Send a new code** and **Use another address**: the request page again; this flow ends. */
export const startAgainFromForm = serverAction(async (_form: FormData): Promise<void> => {
  await clearToken();
  redirect("/sign-in/forgot");
});
