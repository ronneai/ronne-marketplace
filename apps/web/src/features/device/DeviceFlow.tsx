"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError, Input, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { deviceCodeFromForm } from "./actions";
import { type DeviceError, type DeviceFormState, retryMinutes } from "./types";

/**
 * `/device` (feature 107): type or check the code `rmk login --web` printed, see what asked for it,
 * and Approve or Deny. Every step is a POST to one server action.
 */
export const DeviceFlow = ({ initial }: { initial: DeviceFormState }) => {
  const t = useTranslations("auth.device");
  const [state, action, pending] = useActionState(deviceCodeFromForm, initial);
  // The refusal, and when to try again if the limit says (the words are in the messages).
  const errorText = (current: { error?: DeviceError; retryAfterSeconds?: number }) => {
    if (!current.error) return "";
    const minutes = retryMinutes(current.retryAfterSeconds);
    return `${t(`errors.${current.error}`)} ${minutes ? t("retry", { minutes }) : ""}`.trim();
  };

  if (state.step === "done")
    return state.decision === "approved" ? (
      <Notice kind="info" title={t("approvedTitle")}>
        {t.rich("approved", {
          name: state.name,
          mono: (chunks) => <bdi className="font-mono">{chunks}</bdi>,
        })}
      </Notice>
    ) : (
      <Notice kind="info" title={t("deniedTitle")}>
        {t.rich("denied", {
          name: state.name,
          mono: (chunks) => <bdi className="font-mono">{chunks}</bdi>,
          code: (chunks) => <code className="font-mono">{chunks}</code>,
        })}
      </Notice>
    );

  if (state.step === "confirm") {
    const { request } = state;
    return (
      <form action={action} className="grid gap-4">
        {state.error ? <Notice kind="error" title={errorText(state)} /> : null}
        <input type="hidden" name="code" value={request.userCode} />
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
          <dt className="text-muted">{t("code")}</dt>
          <dd className="font-mono text-base text-fg">{request.userCode}</dd>
          <dt className="text-muted">{t("askedBy")}</dt>
          <dd className="font-mono [overflow-wrap:anywhere] text-fg">
            {/* Isolated, so no character in it can reorder the text around it. */}
            <bdi>{request.name}</bdi>
          </dd>
          <dt className="text-muted">{t("askedAt")}</dt>
          <dd className="text-fg">
            <LocalTime value={new Date(request.requestedAt)} />
          </dd>
          {request.requesterIp ? (
            <>
              <dt className="text-muted">{t("fromAddress")}</dt>
              <dd className="font-mono [overflow-wrap:anywhere] text-fg">{request.requesterIp}</dd>
            </>
          ) : null}
        </dl>
        <Notice kind="warn" title={t("warnTitle")}>
          {t("warn")}
        </Notice>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="approve" loading={pending}>
            {t("approve")}
          </Button>
          <Button type="submit" name="intent" value="deny" variant="secondary" disabled={pending}>
            {t("deny")}
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
        <Label htmlFor="device-code">{t("code")}</Label>
        <Input
          id="device-code"
          name="code"
          defaultValue={state.typed}
          // biome-ignore lint/plugin: the shape of the code, the same in every language
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
            {state.typed ? t("hintTyped") : t("hint")}
          </p>
        )}
        <FieldError id="device-code-error">{error || undefined}</FieldError>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          {t("continue")}
        </Button>
      </div>
    </form>
  );
};
