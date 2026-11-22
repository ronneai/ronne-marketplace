"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeInput";
import { Notice } from "@/components/ui/Notice";
import { anotherEmailFromForm, resendSignUpCodeFromForm, signUpCodeFromForm } from "./actions";
import type { SignUpCodeState } from "./types";

/** Seconds from now until `at`, never below 0. */
const secondsUntil = (at: number) => Math.max(0, Math.ceil((at - Date.now()) / 1000));

/**
 * The code page's forms (190): the six boxes (157, one field without JavaScript), **Send a new
 * code** with its countdown, and **Use another email**.
 */
export const CodeStep = ({
  resendAt,
  initial = {},
}: {
  /** When a new code can be asked for, in milliseconds since the epoch. */
  resendAt: number;
  initial?: SignUpCodeState;
}) => {
  const t = useTranslations("auth.signUp.code");
  const [state, action, pending] = useActionState(signUpCodeFromForm, initial);
  const [sent, resend, resending] = useActionState(resendSignUpCodeFromForm, {});
  const [until, setUntil] = useState(resendAt);
  // From the first render, so the page drawn on the server waits the minute too.
  const [left, setLeft] = useState(() => secondsUntil(resendAt));
  // The seconds only once the page is live: the server's count and the browser's could differ.
  const [live, setLive] = useState(false);
  // A new code sent: the next one waits another minute.
  useEffect(() => {
    if (sent.resent) setUntil(Date.now() + 60_000);
    else if (sent.error === "wait" && sent.seconds) setUntil(Date.now() + sent.seconds * 1000);
  }, [sent]);
  useEffect(() => {
    setLive(true);
    setLeft(secondsUntil(until));
    const timer = setInterval(() => setLeft(secondsUntil(until)), 1000);
    return () => clearInterval(timer);
  }, [until]);
  const resendError = sent.error
    ? sent.error === "wait"
      ? t("errors.wait", { seconds: sent.seconds ?? 60 })
      : t(`errors.${sent.error}`)
    : null;
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4" noValidate>
        <CodeInput
          id="code"
          name="code"
          label={t("label")}
          resetKey={state}
          autoFocus
          error={state.error && state.error !== "wait" ? t(`errors.${state.error}`) : undefined}
        />
        <Button type="submit" loading={pending} className="w-full">
          {t("submit")}
        </Button>
      </form>
      {sent.resent ? <Notice kind="info" title={t("resent")} /> : null}
      {resendError ? <Notice kind="error" title={resendError} /> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form action={resend}>
          <Button type="submit" variant="secondary" loading={resending} disabled={left > 0}>
            {live && left > 0 ? t("resendIn", { seconds: left }) : t("resend")}
          </Button>
        </form>
        <form action={anotherEmailFromForm}>
          <button type="submit" className="text-sm text-link underline-offset-2 hover:underline">
            {t("another")}
          </button>
        </form>
      </div>
    </div>
  );
};
