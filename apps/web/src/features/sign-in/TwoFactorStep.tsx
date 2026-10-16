"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { twoFactorFromForm } from "./actions";
import { TWO_FACTOR_STEP_ERRORS, type TwoFactorStepState } from "./types";

/**
 * The second step at sign-in (105): a 6-digit code from the authenticator app, or a backup code.
 * Without JavaScript the switch is a link to the other method's address.
 */
export const TwoFactorStep = ({
  next,
  method: initialMethod,
  initial = {},
}: {
  next: string;
  method: "totp" | "backup_code";
  initial?: TwoFactorStepState;
}) => {
  const [state, action, pending] = useActionState(twoFactorFromForm, initial);
  const [method, setMethod] = useState(initialMethod);
  const backup = method === "backup_code";
  const other = new URLSearchParams();
  if (next !== "/") other.set("next", next);
  if (!backup) other.set("method", "backup");
  const otherHref = `/sign-in/two-factor${other.size ? `?${other}` : ""}`;
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="method" value={method} />
      <TextField
        key={method}
        id="code"
        name="code"
        label={backup ? "Backup code" : "Code from your authenticator app"}
        hint={backup ? "One of the ten codes you saved, such as 3fK9q-Lm2Xz." : undefined}
        autoComplete="one-time-code"
        inputMode={backup ? "text" : "numeric"}
        maxLength={backup ? 32 : 7}
        autoFocus
        required
        error={state.error ? TWO_FACTOR_STEP_ERRORS[state.error] : undefined}
      />
      <Button type="submit" loading={pending} className="w-full">
        Verify
      </Button>
      <a
        href={otherHref}
        onClick={(event) => {
          event.preventDefault();
          setMethod(backup ? "totp" : "backup_code");
        }}
        className="justify-self-start text-sm text-link underline-offset-2 hover:underline"
      >
        {backup ? "Use a code from the app instead" : "Use a backup code instead"}
      </a>
    </form>
  );
};
