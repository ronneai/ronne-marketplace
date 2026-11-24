"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldError, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { newPasswordFromForm } from "./actions";
import type { NewPasswordState } from "./types";

/** Refusals about what was typed: shown at the box, the rest as a notice. */
const TYPED = ["password_short", "password_long", "mismatch"] as const;

/**
 * The new-password page's form (194): the new password twice, with the password rules, and
 * *Also revoke my access tokens*, ticked (162's box, Decision 4). Saving signs no one in.
 */
export const NewPasswordForm = ({ initial = {} }: { initial?: NewPasswordState }) => {
  const t = useTranslations("auth.forgot.newPassword");
  const [state, action, pending] = useActionState(newPasswordFromForm, initial);
  const typed = TYPED.find((r) => r === state.error);
  const passwordError = typed && typed !== "mismatch" ? t(`errors.${typed}`) : undefined;
  const confirmError = typed === "mismatch" ? t("errors.mismatch") : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && !typed ? <Notice kind="error" title={t(`errors.${state.error}`)} /> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="password">{t("password")}</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          autoFocus
          aria-invalid={passwordError ? true : undefined}
          aria-describedby={passwordError ? "password-hint password-error" : "password-hint"}
        />
        <p id="password-hint" className="text-xs text-muted">
          {t("passwordHint")}
        </p>
        <FieldError id="password-error">{passwordError}</FieldError>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">{t("confirm")}</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          maxLength={128}
          aria-invalid={confirmError ? true : undefined}
          aria-describedby={confirmError ? "confirm-error" : undefined}
        />
        <FieldError id="confirm-error">{confirmError}</FieldError>
      </div>
      <div className="grid gap-1">
        <Checkbox id="revokeTokens" name="revokeTokens" defaultChecked label={t("revoke")} />
        <p className="text-xs text-muted">{t("revokeHint")}</p>
      </div>
      <Button type="submit" loading={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
};
