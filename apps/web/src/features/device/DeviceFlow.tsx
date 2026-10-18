"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { deviceCodeFromForm } from "./actions";
import { DEVICE_ERRORS, type DeviceFormState, retryText } from "./types";

const errorText = (state: { error?: keyof typeof DEVICE_ERRORS; retryAfterSeconds?: number }) =>
  state.error ? `${DEVICE_ERRORS[state.error]} ${retryText(state.retryAfterSeconds)}`.trim() : "";

/**
 * `/device` (feature 107): type or check the code `rmk login --web` printed, see what asked for it,
 * and Approve or Deny. Every step is a POST to one server action.
 */
export const DeviceFlow = ({ initial }: { initial: DeviceFormState }) => {
  const [state, action, pending] = useActionState(deviceCodeFromForm, initial);

  if (state.step === "done")
    return state.decision === "approved" ? (
      <Notice kind="info" title="Approved">
        <bdi className="font-mono">{state.name}</bdi> is signed in as you. Go back to your terminal;
        you can close this page. The token is listed in Access tokens, where you can revoke it.
      </Notice>
    ) : (
      <Notice kind="info" title="Denied">
        <bdi className="font-mono">{state.name}</bdi> gets no token. If you didn&apos;t run{" "}
        <code className="font-mono">rmk login --web</code> yourself, someone may have sent you the
        code: nothing was signed in.
      </Notice>
    );

  if (state.step === "confirm") {
    const { request } = state;
    return (
      <form action={action} className="grid gap-4">
        {state.error ? <Notice kind="error" title={errorText(state)} /> : null}
        <input type="hidden" name="code" value={request.userCode} />
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="text-muted">Code</dt>
          <dd className="font-mono text-base text-fg">{request.userCode}</dd>
          <dt className="text-muted">Asked by</dt>
          <dd className="font-mono [overflow-wrap:anywhere] text-fg">
            {/* Isolated, so no character in it can reorder the text around it. */}
            <bdi>{request.name}</bdi>
          </dd>
          <dt className="text-muted">Asked at</dt>
          <dd className="font-mono text-fg">
            <LocalTime value={new Date(request.requestedAt)} />
          </dd>
          {request.requesterIp ? (
            <>
              <dt className="text-muted">From the address</dt>
              <dd className="font-mono [overflow-wrap:anywhere] text-fg">{request.requesterIp}</dd>
            </>
          ) : null}
        </dl>
        <Notice kind="warn" title="Only approve if you just ran rmk login --web yourself">
          Approving gives the terminal that asked a token that acts as you for 90 days.
        </Notice>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="approve" loading={pending}>
            Approve
          </Button>
          <Button type="submit" name="intent" value="deny" variant="secondary" disabled={pending}>
            Deny
          </Button>
        </div>
      </form>
    );
  }

  const error = errorText(state);
  return (
    <form action={action} className="grid max-w-sm gap-4" noValidate>
      <input type="hidden" name="intent" value="look-up" />
      <div className="grid gap-1.5">
        <Label htmlFor="device-code">Code</Label>
        <Input
          id="device-code"
          name="code"
          defaultValue={state.typed}
          placeholder="XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          className="font-mono uppercase"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "device-code-error" : "device-code-hint"}
        />
        {error ? null : (
          <p id="device-code-hint" className="text-xs text-muted">
            {state.typed
              ? "Check that it's the code your terminal shows."
              : "The 8 characters rmk login --web printed."}
          </p>
        )}
        <FieldError id="device-code-error">{error || undefined}</FieldError>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Continue
        </Button>
      </div>
    </form>
  );
};
