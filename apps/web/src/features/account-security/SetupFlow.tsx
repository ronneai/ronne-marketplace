"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { confirmFromForm, startFromForm } from "./actions";
import { BackupCodes } from "./BackupCodes";
import type { ConfirmState, Setup, StartState, TwoFactorError } from "./types";

const Refusal = ({ error }: { error?: TwoFactorError }) => {
  const t = useTranslations("account.security.errors");
  return error ? <Notice kind="error" title={t(error)} /> : null;
};

/** The password, before a setup is shown (or to start over). */
const PasswordStep = ({
  action,
  pending,
  startOver = false,
  submit,
}: {
  action: (form: FormData) => void;
  pending: boolean;
  startOver?: boolean;
  submit: string;
}) => {
  const t = useTranslations("account.security.setup");
  return (
    <form action={action} className="grid max-w-sm gap-3" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor={startOver ? "start-over-password" : "setup-password"}>
          {t("password")}
        </Label>
        <PasswordInput
          id={startOver ? "start-over-password" : "setup-password"}
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </div>
      {startOver ? <input type="hidden" name="startOver" value="on" /> : null}
      <div>
        <Button type="submit" variant={startOver ? "secondary" : "primary"} loading={pending}>
          {submit}
        </Button>
      </div>
    </form>
  );
};

/** The QR code, the secret to type, and the first code. */
const ScanStep = ({
  setup,
  restart,
  restarting,
  onDone,
}: {
  setup: Setup;
  restart: (form: FormData) => void;
  restarting: boolean;
  onDone: () => void;
}) => {
  const t = useTranslations("account.security.setup");
  const tErrors = useTranslations("account.security.errors");
  const [state, confirm, pending] = useActionState<ConfirmState, FormData>(confirmFromForm, {});
  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title={t("doneTitle")}>
          {t("done")}
        </Notice>
        <BackupCodes codes={setup.backupCodes}>
          <Button onClick={onDone}>{t("saved")}</Button>
        </BackupCodes>
      </div>
    );
  return (
    <div className="grid gap-5">
      <ol className="grid list-decimal gap-2 pl-5 text-sm text-fg">
        <li>{t("step1")}</li>
        <li>{t("step2")}</li>
        <li>{t("step3")}</li>
      </ol>
      <div className="flex flex-wrap items-start gap-5">
        {/* biome-ignore lint/performance/noImgElement: a data: SVG drawn on the server for this one request; next/image has nothing to optimise, and the secret must not go through its loader. */}
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`}
          alt={t("qrAlt")}
          width={192}
          height={192}
          className="size-48 shrink-0 rounded-control border border-hairline [image-rendering:pixelated]"
        />
        <div className="grid min-w-0 gap-1.5">
          <p className="text-xs font-semibold text-muted">{t("orType")}</p>
          <code className="break-all font-mono text-[13px] text-fg">{setup.secret}</code>
          <p className="text-xs text-muted">{t("keyNote")}</p>
        </div>
      </div>
      <form action={confirm} className="grid max-w-sm gap-3" noValidate>
        <input type="hidden" name="uri" value={setup.uri} />
        <TextField
          id="first-code"
          name="code"
          label={t("code")}
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={7}
          required
          error={state.error ? tErrors(state.error) : undefined}
        />
        <div>
          <Button type="submit" loading={pending}>
            {t("turnOn")}
          </Button>
        </div>
      </form>
      <details className="grid gap-2">
        <summary className="w-fit cursor-pointer text-sm text-link underline-offset-2 hover:underline">
          {t("startOverSummary")}
        </summary>
        <div className="grid gap-2 pt-2">
          <p className="text-sm text-muted">{t("startOverNote")}</p>
          <PasswordStep action={restart} pending={restarting} startOver submit={t("startOver")} />
        </div>
      </details>
    </div>
  );
};

/**
 * Turning two-factor on (feature 105): the password, then the QR code and the first code, then
 * the backup codes. Starting again in this browser shows the same setup; Start over makes a new
 * one.
 */
export const SetupFlow = ({
  initial = {},
  onDone = () => {},
}: {
  initial?: StartState;
  /** "I've saved them", once it's on and the backup codes were shown. */
  onDone?: () => void;
}) => {
  const t = useTranslations("account.security.setup");
  const [state, start, pending] = useActionState<StartState, FormData>(startFromForm, initial);
  return (
    <div className="grid gap-4">
      <Refusal error={state.error} />
      {state.setup ? (
        <ScanStep
          key={state.setup.uri}
          setup={state.setup}
          restart={start}
          restarting={pending}
          onDone={onDone}
        />
      ) : (
        <PasswordStep action={start} pending={pending} submit={t("start")} />
      )}
    </div>
  );
};
