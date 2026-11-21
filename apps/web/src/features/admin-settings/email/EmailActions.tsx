"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useKeptActionState } from "@/components/ui/kept-form";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import { sendTestEmail, stopSending } from "./actions";
import { reasonKey } from "./reasons";
import type { StopSendingState, TestEmailState } from "./types";

/**
 * Send test email and Stop sending (189). The test goes to the signed-in root's own address,
 * never one typed in. Stop sending asks once more on the page itself (no browser dialog) before it
 * clears the transport and drops what's waiting.
 */
export const EmailActions = ({
  to,
  initialTest = {},
  initialStop = {},
}: {
  /** The signed-in root's address, where the test goes. */
  to: string;
  initialTest?: TestEmailState;
  initialStop?: StopSendingState;
}) => {
  const t = useTranslations("admin.settings.email");
  const r = useTranslations("admin.settings.email.reasons");
  const test = useKeptActionState(sendTestEmail, initialTest);
  const stop = useKeptActionState(stopSending, initialStop);
  const [confirming, setConfirming] = useState(false);
  const tested = test.state;
  const stopped = stop.state;
  useToastWhen(
    stop.state,
    stop.state !== initialStop && stopped.done
      ? t("stop.done", { count: stopped.dropped ?? 0 })
      : null,
  );
  const result = tested?.result;
  return (
    <div className="grid gap-6">
      <form
        action={test.action}
        onSubmit={test.onSubmit}
        aria-label={t("test.title")}
        className="grid gap-3"
      >
        <div className="grid gap-1">
          <h2 className="text-base font-semibold text-fg">{t("test.title")}</h2>
          <p className="text-sm text-muted">{t("test.intro", { to })}</p>
        </div>
        {tested?.error ? <Notice kind="error" title={tested.error} /> : null}
        {result?.result === "sent" ? (
          <Notice kind="info" title={t("test.sent", { to: tested?.to ?? to })} />
        ) : null}
        {result && result.result !== "sent" ? (
          <Notice kind="error" title={t("test.failed", { reason: r(reasonKey(result.reason)) })}>
            {result.detail ? (
              <p className="mt-1 grid gap-1">
                <span>{t("test.answer")}</span>
                <code className="font-mono text-xs break-all">{result.detail}</code>
              </p>
            ) : null}
          </Notice>
        ) : null}
        <div>
          <Button type="submit" variant="secondary" loading={test.pending}>
            {t("test.button")}
          </Button>
        </div>
      </form>

      <form
        action={stop.action}
        onSubmit={stop.onSubmit}
        aria-label={t("stop.title")}
        className="grid gap-3"
      >
        <div className="grid gap-1">
          <h2 className="text-base font-semibold text-fg">{t("stop.title")}</h2>
          <p className="text-sm text-muted">{t("stop.intro")}</p>
        </div>
        {confirming ? (
          <Notice kind="warn" title={t("stop.confirm")}>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="submit" variant="destructive" loading={stop.pending}>
                {t("stop.confirmButton")}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                {t("stop.cancel")}
              </Button>
            </div>
          </Notice>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              {t("stop.button")}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};
