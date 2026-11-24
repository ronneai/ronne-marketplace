"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { inputClasses, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { useChallenge } from "@/features/sign-up/hooks";
import { requestResetFromForm } from "./actions";
import type { ResetRequestState } from "./types";

/**
 * The request page's form (194): the email address. 190's guards come with it: a hidden field a
 * person never fills, a signed stamp of when the form was drawn, and, when root keeps it on, a
 * challenge the browser solves while the person types.
 */
export const RequestForm = ({
  stamp,
  challenge,
  locale,
  initial = {},
}: {
  stamp: string;
  /** The challenge as JSON, or null when root turned it off. */
  challenge: string | null;
  /** The page's language: the email is written in it. */
  locale: string;
  initial?: ResetRequestState;
}) => {
  const t = useTranslations("auth.forgot");
  const [state, action, pending] = useActionState(requestResetFromForm, initial);
  const solved = useChallenge(state.challenge ?? challenge);
  const waiting = solved.status === "solving";
  const emailError = state.error === "invalid_email" ? t("errors.invalid_email") : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="stamp" value={stamp} />
      <input type="hidden" name="locale" value={locale} />
      {challenge ? <input type="hidden" name="challengeOn" value="1" /> : null}
      {solved.status === "ready" ? (
        <input type="hidden" name="challenge" value={solved.answer} />
      ) : null}
      {state.error && state.error !== "invalid_email" ? (
        <Notice kind="error" title={t(`errors.${state.error}`)} />
      ) : null}
      {/* Off screen and out of the tab order: only a bot fills it. */}
      <div aria-hidden="true" className="absolute -left-[10000px] size-px overflow-hidden">
        <label htmlFor="website">{t("trap")}</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          className={inputClasses}
        />
      </div>
      <TextField
        id="email"
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        maxLength={254}
        required
        autoFocus
        defaultValue={state.email}
        error={emailError}
      />
      {challenge ? (
        <>
          <noscript>
            <Notice kind="info" title={t("noScript")} />
          </noscript>
          <p className="text-xs text-muted" aria-live="polite">
            {solved.status === "ready" ? t("checked") : waiting ? t("checking") : null}
          </p>
        </>
      ) : null}
      <Button type="submit" loading={pending || waiting} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
};
