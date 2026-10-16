"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { regenerateFromForm, turnOffFromForm } from "./actions";
import { BackupCodes } from "./BackupCodes";
import { type RegenerateState, type TurnOffState, TWO_FACTOR_ERRORS } from "./types";

const Password = ({ id }: { id: string }) => (
  <div className="grid gap-1.5">
    <Label htmlFor={id}>Your password</Label>
    <PasswordInput
      id={id}
      name="password"
      autoComplete="current-password"
      required
      maxLength={128}
    />
  </div>
);

/** New backup codes: the password, then ten codes shown once; the old ones stop working. */
export const RegenerateBackupCodes = ({ onDone = () => {} }: { onDone?: () => void }) => {
  const [state, action, pending] = useActionState<RegenerateState, FormData>(
    regenerateFromForm,
    {},
  );
  if (state.backupCodes)
    return (
      <BackupCodes codes={state.backupCodes}>
        <Button onClick={onDone}>I&apos;ve saved them</Button>
      </BackupCodes>
    );
  return (
    <form action={action} aria-label="New backup codes" className="grid max-w-sm gap-3" noValidate>
      <p className="text-sm text-muted">
        Ten new codes, shown once. The ones you have now stop working.
      </p>
      {state.error ? <Notice kind="error" title={TWO_FACTOR_ERRORS[state.error]} /> : null}
      <Password id="regenerate-password" />
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          Make new backup codes
        </Button>
      </div>
    </form>
  );
};

/** Turning two-factor off: the password and a code from the app, or a backup code. */
export const TurnOffTwoFactor = ({ onDone = () => {} }: { onDone?: () => void }) => {
  const [state, action, pending] = useActionState<TurnOffState, FormData>(turnOffFromForm, {});
  if (state.done)
    return (
      <div className="grid gap-3">
        <Notice kind="info" title="Two-factor sign-in is off">
          Signing in asks only for your password now.
        </Notice>
        <div>
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  return (
    <form
      action={action}
      aria-label="Turn off two-factor"
      className="grid max-w-sm gap-3"
      noValidate
    >
      {state.error && state.error !== "wrong_code" ? (
        <Notice kind="error" title={TWO_FACTOR_ERRORS[state.error]} />
      ) : null}
      <Password id="turn-off-password" />
      <TextField
        id="turn-off-code"
        name="code"
        label="A code from the app, or a backup code"
        autoComplete="one-time-code"
        maxLength={32}
        required
        error={state.error === "wrong_code" ? TWO_FACTOR_ERRORS.wrong_code : undefined}
      />
      <div>
        <Button type="submit" variant="destructive" loading={pending}>
          Turn off two-factor
        </Button>
      </div>
    </form>
  );
};
