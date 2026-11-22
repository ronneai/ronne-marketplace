"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldError, inputClasses, Label, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { signUpFromForm } from "./actions";
import { useChallenge } from "./hooks";
import type { SignUpFormState } from "./types";

/**
 * The sign-up form (190): name, email, password (one field, with its show button), and the terms
 * when root set a link. A hidden field a person never fills, a signed stamp of when the form was
 * drawn, and, when root keeps it on, a challenge the browser solves while the person types.
 */
export const SignUpForm = ({
  stamp,
  challenge,
  termsUrl,
  locale,
  initial = {},
}: {
  stamp: string;
  /** The challenge as JSON, or null when root turned it off. */
  challenge: string | null;
  /** Root's terms and privacy link; empty for none. */
  termsUrl: string;
  /** The page's language: the account and its emails get it. */
  locale: string;
  initial?: SignUpFormState;
}) => {
  const t = useTranslations("auth.signUp");
  const [state, action, pending] = useActionState(signUpFromForm, initial);
  const solved = useChallenge(state.challenge ?? challenge);
  const waiting = solved.status === "solving";
  const error = (field: string) =>
    state.error && state.field === field ? t(`errors.${state.error}`) : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="stamp" value={stamp} />
      <input type="hidden" name="locale" value={locale} />
      {challenge ? <input type="hidden" name="challengeOn" value="1" /> : null}
      {solved.status === "ready" ? (
        <input type="hidden" name="challenge" value={solved.answer} />
      ) : null}
      {state.error && !state.field ? (
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
        id="name"
        name="name"
        label={t("name")}
        autoComplete="name"
        maxLength={255}
        required
        defaultValue={state.name}
        error={error("name")}
      />
      <TextField
        id="email"
        name="email"
        type="email"
        label={t("email")}
        autoComplete="email"
        maxLength={254}
        required
        defaultValue={state.email}
        error={error("email")}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          aria-invalid={error("password") ? true : undefined}
          aria-describedby={error("password") ? "password-hint password-error" : "password-hint"}
        />
        <p id="password-hint" className="text-xs text-muted">
          {t("passwordHint")}
        </p>
        <FieldError id="password-error">{error("password")}</FieldError>
      </div>
      {termsUrl ? (
        <div className="grid gap-1">
          <Checkbox
            id="terms"
            name="terms"
            required
            aria-invalid={error("terms") ? true : undefined}
            label={t.rich("terms", {
              link: (chunks) => (
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link underline-offset-2 hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          />
          <FieldError id="terms-error">{error("terms")}</FieldError>
        </div>
      ) : null}
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
