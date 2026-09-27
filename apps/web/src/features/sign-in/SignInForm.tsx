"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { signInFromForm } from "./actions";
import { ForgotPassword } from "./ForgotPassword";
import { SIGN_IN_ERRORS, type SignInFormState } from "./types";

/**
 * Email, password and "Remember me". With JavaScript, errors show without a page load; without it,
 * the form still posts to the server action and the page comes back with the error.
 */
export function SignInForm({ next, initial = {} }: { next: string; initial?: SignInFormState }) {
  const [state, action, pending] = useActionState(signInFromForm, initial);
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error ? <Notice kind="error" title={SIGN_IN_ERRORS[state.error]} /> : null}
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
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
          <Label htmlFor="password">Password</Label>
          <ForgotPassword />
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
      <Checkbox id="remember" name="remember" label="Remember me (30 days)" />
      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  );
}
