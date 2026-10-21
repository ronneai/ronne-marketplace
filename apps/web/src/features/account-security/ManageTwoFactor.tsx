"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { regenerateFromForm, turnOffFromForm } from "./actions";
import { BackupCodes } from "./BackupCodes";
import type { RegenerateState, TurnOffState } from "./types";

const Password = ({ id }: { id: string }) => {
  const t = useTranslations("account.security.setup");
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t("password")}</Label>
      <PasswordInput
        id={id}
        name="password"
        autoComplete="current-password"
        required
        maxLength={128}
      />
    </div>
  );
};

/** New backup codes: the password, then ten codes shown once; the old ones stop working. */
export const RegenerateBackupCodes = ({ onDone = () => {} }: { onDone?: () => void }) => {
  const t = useTranslations("account.security");
  const [state, action, pending] = useActionState<RegenerateState, FormData>(
    regenerateFromForm,
    {},
  );
  if (state.backupCodes)
    return (
      <BackupCodes codes={state.backupCodes}>
        <Button onClick={onDone}>{t("setup.saved")}</Button>
      </BackupCodes>
    );
  return (
    <form
      action={action}
      aria-label={t("manage.regenerateLabel")}
      className="grid max-w-sm gap-3"
      noValidate
    >
      <p className="text-sm text-muted">{t("manage.regenerateNote")}</p>
      {state.error ? <Notice kind="error" title={t(`errors.${state.error}`)} /> : null}
      <Password id="regenerate-password" />
      <div>
        <Button type="submit" variant="secondary" loading={pending}>
          {t("manage.regenerate")}
        </Button>
      </div>
    </form>
  );
};

/** Turning two-factor off: the password and a code from the app, or a backup code. */
export const TurnOffTwoFactor = ({ onDone = () => {} }: { onDone?: () => void }) => {
  const t = useTranslations("account.security");
  const [state, action, pending] = useActionState<TurnOffState, FormData>(turnOffFromForm, {});
  if (state.done)
    return (
      <div className="grid gap-3">
        <Notice kind="info" title={t("manage.offTitle")}>
          {t("manage.off")}
        </Notice>
        <div>
          <Button onClick={onDone}>{t("manage.done")}</Button>
        </div>
      </div>
    );
  return (
    <form
      action={action}
      aria-label={t("manage.turnOffLabel")}
      className="grid max-w-sm gap-3"
      noValidate
    >
      {state.error && state.error !== "wrong_code" && state.error !== "used" ? (
        <Notice kind="error" title={t(`errors.${state.error}`)} />
      ) : null}
      <Password id="turn-off-password" />
      <TextField
        id="turn-off-code"
        name="code"
        label={t("manage.code")}
        autoComplete="one-time-code"
        maxLength={32}
        required
        error={
          state.error === "wrong_code" || state.error === "used"
            ? t(`errors.${state.error}`)
            : undefined
        }
      />
      <div>
        <Button type="submit" variant="destructive" loading={pending}>
          {t("manage.turnOff")}
        </Button>
      </div>
    </form>
  );
};
