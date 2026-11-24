"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CodeInput } from "@/components/ui/CodeInput";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { resetTwoFactorFromForm } from "./actions";
import type { ResetStepState } from "./types";

/**
 * The reset's two-factor step (194, Decision 2): a code from the authenticator app, a box a digit,
 * or a backup code, as at sign-in. Without JavaScript the switch is a link to the other method.
 */
export const TwoFactorForm = ({
  method: initialMethod,
  initial = {},
}: {
  method: "totp" | "backup_code";
  initial?: ResetStepState;
}) => {
  const t = useTranslations("auth.forgot.twoFactor");
  const [state, action, pending] = useActionState(resetTwoFactorFromForm, initial);
  const [method, setMethod] = useState(initialMethod);
  const backup = method === "backup_code";
  // A wrong or used code: the box. The rest end or hold the step: a notice.
  const boxError =
    state.error === "wrong" || state.error === "used" ? t(`errors.${state.error}`) : undefined;
  return (
    <form action={action} className="grid gap-4" noValidate>
      {state.error && !boxError ? <Notice kind="error" title={t(`errors.${state.error}`)} /> : null}
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
          error={boxError}
        />
      ) : (
        <CodeInput
          key={method}
          id="code"
          name="code"
          label={t("code")}
          resetKey={state}
          autoFocus
          error={boxError}
        />
      )}
      <Button type="submit" loading={pending} className="w-full">
        {t("submit")}
      </Button>
      <a
        href={backup ? "/sign-in/forgot/two-factor" : "/sign-in/forgot/two-factor?method=backup"}
        onClick={(event) => {
          event.preventDefault();
          setMethod(backup ? "totp" : "backup_code");
        }}
        className="justify-self-start text-sm text-link underline-offset-2 hover:underline"
      >
        {backup ? t("useApp") : t("useBackup")}
      </a>
      <p className="text-xs text-muted">{t("lost")}</p>
    </form>
  );
};
