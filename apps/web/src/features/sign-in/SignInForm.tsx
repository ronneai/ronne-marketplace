"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { signInFromForm } from "./actions";
import { ForgotPassword } from "./ForgotPassword";
import type { SignInFormState } from "./types";

/**
 * Email, password and "Remember me". With JavaScript, errors show without a page load; without it,
 * the form still posts to the server action and the page comes back with the error.
 */
export const SignInForm = ({
  next,
  resetCommand,
  initial = {},
}: {
  next: string;
  /** For the Forgot? note (#147). */
  resetCommand: string;
  initial?: SignInFormState;
}) => {
  const t = useTranslations("auth.signIn");
  const [state, action, pending] = useActionState(signInFromForm, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <Notice kind="error" title={t(`errors.${state.error}`)} /> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="email">{t("email")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={255}
          defaultValue={state.email}
          aria-invalid={state.error === "invalid_credentials" || undefined}
        />
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="password">{t("password")}</Label>
          <ForgotPassword resetCommand={resetCommand} />
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
          aria-invalid={state.error === "invalid_credentials" || undefined}
        />
      </div>
      <Checkbox id="remember" name="remember" label={t("remember")} />
      <Button type="submit" loading={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
};
