"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { changePasswordFromForm } from "./actions";
import { type ChangePasswordFormState, ERROR_FIELD } from "./types";

/** The fields; their words are `account.password.<name>` (and `nextHint`) in the messages. */
const FIELDS = [
  { name: "current", autoComplete: "current-password" },
  { name: "next", autoComplete: "new-password", hint: "nextHint" },
  { name: "confirm", autoComplete: "new-password" },
] as const;

/** Current, new and confirm. Nothing is kept after a submit: these are all passwords. */
export const ChangePasswordForm = ({ initial = {} }: { initial?: ChangePasswordFormState }) => {
  const t = useTranslations("account.password");
  const [state, action, pending] = useActionState(changePasswordFromForm, initial);
  const errorField = state.error ? ERROR_FIELD[state.error] : null;
  return (
    <form action={action} className="grid max-w-sm gap-4" noValidate>
      {state.changed ? (
        <Notice kind="info" title={t("changedTitle")}>
          {t("changed")}
        </Notice>
      ) : null}
      {state.error && !errorField ? (
        <Notice kind="error" title={t(`errors.${state.error}`)} />
      ) : null}
      {FIELDS.map((field) => {
        const error =
          state.error && errorField === field.name ? t(`errors.${state.error}`) : undefined;
        const hint = "hint" in field ? t(field.hint) : undefined;
        const describedBy =
          [hint ? `${field.name}-hint` : "", error ? `${field.name}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <div key={field.name} className="grid gap-1.5">
            <Label htmlFor={field.name}>{t(field.name)}</Label>
            <PasswordInput
              id={field.name}
              name={field.name}
              autoComplete={field.autoComplete}
              required
              maxLength={field.name === "current" ? 128 : undefined}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
            />
            {hint ? (
              <p id={`${field.name}-hint`} className="text-xs text-muted">
                {hint}
              </p>
            ) : null}
            <FieldError id={`${field.name}-error`}>{error}</FieldError>
          </div>
        );
      })}
      <div>
        <Button type="submit" loading={pending}>
          {t("submit")}
        </Button>
      </div>
    </form>
  );
};
