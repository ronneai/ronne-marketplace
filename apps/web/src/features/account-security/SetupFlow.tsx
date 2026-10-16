"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { confirmFromForm, startFromForm } from "./actions";
import { BackupCodes } from "./BackupCodes";
import {
  type ConfirmState,
  type Setup,
  type StartState,
  TWO_FACTOR_ERRORS,
  type TwoFactorError,
} from "./types";

const Refusal = ({ error }: { error?: TwoFactorError }) =>
  error ? <Notice kind="error" title={TWO_FACTOR_ERRORS[error]} /> : null;

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
}) => (
  <form action={action} className="grid max-w-sm gap-3" noValidate>
    <div className="grid gap-1.5">
      <Label htmlFor={startOver ? "start-over-password" : "setup-password"}>Your password</Label>
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
  const [state, confirm, pending] = useActionState<ConfirmState, FormData>(confirmFromForm, {});
  if (state.done)
    return (
      <div className="grid gap-4">
        <Notice kind="info" title="Two-factor sign-in is on">
          From now on, signing in with your password also asks for a code from the app.
        </Notice>
        <BackupCodes codes={setup.backupCodes}>
          <Button onClick={onDone}>I&apos;ve saved them</Button>
        </BackupCodes>
      </div>
    );
  return (
    <div className="grid gap-5">
      <ol className="grid list-decimal gap-2 pl-5 text-sm text-fg">
        <li>
          Open your authenticator app (Google Authenticator, 1Password, Authy, Microsoft
          Authenticator…).
        </li>
        <li>Scan the QR code, or type the key.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-start gap-5">
        {/* biome-ignore lint/performance/noImgElement: a data: SVG drawn on the server for this one request; next/image has nothing to optimise, and the secret must not go through its loader. */}
        <img
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}`}
          alt="QR code for your authenticator app"
          width={192}
          height={192}
          className="size-48 shrink-0 rounded-control border border-hairline [image-rendering:pixelated]"
        />
        <div className="grid min-w-0 gap-1.5">
          <p className="text-xs font-semibold text-muted">Or type this key</p>
          <code className="break-all font-mono text-[13px] text-fg">{setup.secret}</code>
          <p className="text-xs text-muted">Time-based, 6 digits, every 30 seconds.</p>
        </div>
      </div>
      <form action={confirm} className="grid max-w-sm gap-3" noValidate>
        <input type="hidden" name="uri" value={setup.uri} />
        <TextField
          id="first-code"
          name="code"
          label="Code from the app"
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={7}
          required
          error={state.error ? TWO_FACTOR_ERRORS[state.error] : undefined}
        />
        <div>
          <Button type="submit" loading={pending}>
            Turn on
          </Button>
        </div>
      </form>
      <details className="grid gap-2">
        <summary className="w-fit cursor-pointer text-sm text-link underline-offset-2 hover:underline">
          Start over with a new key
        </summary>
        <div className="grid gap-2 pt-2">
          <p className="text-sm text-muted">
            A new QR code and new backup codes; this one stops working.
          </p>
          <PasswordStep action={restart} pending={restarting} startOver submit="Start over" />
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
        <PasswordStep action={start} pending={pending} submit="Set up two-factor" />
      )}
    </div>
  );
};
