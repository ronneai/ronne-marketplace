"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeInput";
import { TextField } from "@/components/ui/Field";
import { twoFactorFromForm } from "./actions";
import type { TwoFactorStepState } from "./types";

/**
 * The second step at sign-in (105): a 6-digit code from the authenticator app, in a box a digit (157),
 * or a backup code.
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
  const t = useTranslations("auth.twoFactor");
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
      {backup ? (
        <TextField
          key={method}
          id="code"
          name="code"
          label={t("backup")}
          hint={t("backupHint")}
          autoComplete="one-time-code"
          maxLength={32}
          autoFocus
          required
          error={state.error ? t(`errors.${state.error}`) : undefined}
        />
      ) : (
        <CodeInput
          key={method}
          id="code"
          name="code"
          label={t("code")}
          resetKey={state}
          autoFocus
          error={state.error ? t(`errors.${state.error}`) : undefined}
        />
      )}
      <Button type="submit" loading={pending} className="w-full">
        {t("verify")}
      </Button>
      <a
        href={otherHref}
        onClick={(event) => {
          event.preventDefault();
          setMethod(backup ? "totp" : "backup_code");
        }}
        className="justify-self-start text-sm text-link underline-offset-2 hover:underline"
      >
        {backup ? t("useApp") : t("useBackup")}
      </a>
      <div className="justify-self-start">
        <Help id="lost-phone" />
      </div>
    </form>
  );
};
