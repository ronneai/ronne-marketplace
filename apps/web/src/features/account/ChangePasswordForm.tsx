"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { changePasswordFromForm } from "./actions";
import { CHANGE_PASSWORD_ERRORS, type ChangePasswordFormState, ERROR_FIELD } from "./types";

const FIELDS = [
  { name: "current", label: "Current password", autoComplete: "current-password" },
  {
    name: "next",
    label: "New password",
    autoComplete: "new-password",
    hint: "12 to 128 characters.",
  },
  { name: "confirm", label: "Confirm new password", autoComplete: "new-password" },
] as const;

/** Current, new and confirm. Nothing is kept after a submit: these are all passwords. */
export const ChangePasswordForm = ({ initial = {} }: { initial?: ChangePasswordFormState }) => {
  const [state, action, pending] = useActionState(changePasswordFromForm, initial);
  const errorField = state.error ? ERROR_FIELD[state.error] : null;
  return (
    <form action={action} className="grid max-w-sm gap-4" noValidate>
      {state.changed ? (
        <Notice kind="info" title="Password changed">
          You&apos;re still signed in here; other sessions were signed out.
        </Notice>
      ) : null}
      {state.error && !errorField ? (
        <Notice kind="error" title={CHANGE_PASSWORD_ERRORS[state.error]} />
      ) : null}
      {FIELDS.map((field) => {
        const error =
          state.error && errorField === field.name
            ? CHANGE_PASSWORD_ERRORS[state.error]
            : undefined;
        const hint = "hint" in field ? field.hint : undefined;
        const describedBy =
          [hint ? `${field.name}-hint` : "", error ? `${field.name}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <div key={field.name} className="grid gap-1.5">
            <Label htmlFor={field.name}>{field.label}</Label>
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
          Change password
        </Button>
      </div>
    </form>
  );
};
