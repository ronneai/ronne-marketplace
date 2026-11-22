"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadConfig } from "@/server/config";
import * as signUp from "@/server/domains/identity/actions/sign-up";
import {
  issueChallenge,
  SIGN_UP_COOKIE,
  signUpCookieValue,
  signUpIdFromCookie,
} from "@/server/domains/identity/models/sign-up-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { SignUpCodeState, SignUpFormState } from "./types";

const secret = () => {
  const authSecret = loadConfig().authSecret;
  if (!authSecret) throw new Error("AUTH_SECRET isn't set");
  return authSecret;
};

/** The cookie that ties the code page to this browser: HttpOnly, SameSite=Lax, only for sign-up. */
const COOKIE = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/sign-up",
  // The longest a code lives (60 minutes); the page itself checks the sign-up's own end.
  maxAge: 60 * 60,
};

/** This browser's sign-up, from its cookie. */
const currentSignUp = async (): Promise<string | null> =>
  signUpIdFromCookie(secret(), (await cookies()).get(SIGN_UP_COOKIE)?.value);

const setCookie = async (value: string) =>
  (await cookies()).set(SIGN_UP_COOKIE, value, {
    ...COOKIE,
    secure: (loadConfig().publicUrl ?? "").startsWith("https://"),
  });
const clearCookie = async () =>
  (await cookies()).delete({ name: SIGN_UP_COOKIE, path: "/sign-up" });

/** The sign-up form (190). It works without JavaScript, but the challenge, when on, needs it. */
export const signUpFromForm = serverAction(
  async (previous: SignUpFormState, form: FormData): Promise<SignUpFormState> => {
    const name = String(form.get("name") ?? "");
    const email = String(form.get("email") ?? "");
    const result = await signUp.requestSignUp(await requestHeaders(), {
      name,
      email,
      password: form.get("password"),
      termsAccepted: form.get("terms") === "on",
      termsVersion: form.get("termsVersion") ?? "",
      locale: form.get("locale"),
      stamp: form.get("stamp"),
      honeypot: form.get("website"),
      challenge: form.get("challenge"),
      previous: await currentSignUp(),
    });
    if (result.ok) {
      await setCookie(signUpCookieValue(secret(), result.id));
      redirect("/sign-up/code");
    }
    if (result.refusal === "closed") redirect("/sign-in");
    return {
      error: result.refusal,
      ...(result.field ? { field: result.field } : {}),
      // The terms shown after a change stay shown through any later refusal.
      ...(result.terms || previous.terms ? { terms: result.terms ?? previous.terms } : {}),
      name: name.slice(0, 255),
      email: email.slice(0, 255),
      // Each answer is taken once: a refused form needs a new challenge, when it's on.
      ...(form.get("challengeOn") === "1"
        ? { challenge: JSON.stringify(issueChallenge(secret(), new Date())) }
        : {}),
    };
  },
);

/** The code page's form: the six digits. Right, the account exists and sign-in opens. */
export const signUpCodeFromForm = serverAction(
  async (_previous: SignUpCodeState, form: FormData): Promise<SignUpCodeState> => {
    const result = await signUp.enterSignUpCode(await requestHeaders(), {
      id: await currentSignUp(),
      code: form.get("code"),
    });
    if (result.ok) {
      await clearCookie();
      const query = new URLSearchParams({
        email: result.email,
        signedUp: result.waiting ? "waiting" : "ready",
      });
      redirect(`/sign-in?${query}`);
    }
    if (result.refusal === "ended" || result.refusal === "closed" || result.refusal === "exists")
      await clearCookie();
    return { error: result.refusal };
  },
);

/** **Send a new code**. */
export const resendSignUpCodeFromForm = serverAction(
  async (_previous: SignUpCodeState, _form: FormData): Promise<SignUpCodeState> => {
    const result = await signUp.resendSignUpCode(await requestHeaders(), await currentSignUp());
    if (result.ok) return { resent: true };
    if (result.refusal === "wait") return { error: "wait", seconds: result.seconds };
    return { error: result.refusal };
  },
);

/** **Use another email**: this sign-up ends, and the form opens again. */
export const anotherEmailFromForm = serverAction(async (_form: FormData): Promise<void> => {
  await signUp.cancelSignUp(await currentSignUp());
  await clearCookie();
  redirect("/sign-up");
});
