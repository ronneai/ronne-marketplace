"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { useKeptActionState } from "@/components/ui/kept-form";
import { Notice } from "@/components/ui/Notice";
import { useToastWhen } from "@/components/ui/toast";
import type {
  PasswordResetBlocker,
  PasswordResetPolicy,
  PasswordResetReadiness,
} from "@/server/domains/settings/models/password-reset-policy";
import { savePasswordReset } from "./password-reset-actions";
import type { PasswordResetFormState } from "./password-reset-types";

/** What still blocks it, in the panel's order (the model's own rule, without its imports). */
export const resetBlockersOf = (readiness: PasswordResetReadiness): PasswordResetBlocker[] => [
  ...(readiness.mail ? [] : (["mail"] as const)),
  ...(readiness.mail && !readiness.working ? (["working"] as const) : []),
  ...(readiness.contact ? [] : (["contact"] as const)),
];

/**
 * Admin › Settings › Authentication's Forgot password by email panel (194): whether people can
 * reset a forgotten password with a code sent to their address. Off until root turns it on, and
 * only while email is set up, its last test passed, and the instance contact is set; the panel
 * says what's missing and where to fix it. Turning it off always works.
 */
export const PasswordResetForm = ({
  policy,
  readiness,
  initial = {},
}: {
  policy: PasswordResetPolicy;
  readiness: PasswordResetReadiness;
  initial?: PasswordResetFormState;
}) => {
  const t = useTranslations("admin.settings.passwordReset");
  const { state, action, pending, onSubmit } = useKeptActionState(savePasswordReset, initial);
  const fresh = state !== initial;
  useToastWhen(state, fresh && state.done ? t(`done.${state.done}`) : null);
  const blockers = resetBlockersOf(readiness);
  const [enabled, setEnabled] = useState(policy.enabled);
  return (
    <form
      action={action}
      onSubmit={onSubmit}
      aria-label={t("title")}
      className="grid gap-5"
      noValidate
    >
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
          <Help id="reset-by-email" />
        </div>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      {blockers.length > 0 ? (
        <Notice
          kind={policy.enabled ? "warn" : "info"}
          title={t(policy.enabled ? "closedTitle" : "blockedTitle")}
        >
          <ul className="grid list-disc gap-1 pl-5">
            {blockers.map((blocker) => (
              <li key={blocker}>
                {t(`blockers.${blocker}`)}{" "}
                <a href="/admin/settings?tab=email" className="text-link underline">
                  {t(`fix.${blocker}`)}
                </a>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {state.error ? <Notice kind="error" title={state.error} /> : null}
      <label htmlFor="password-reset-enabled" className="flex items-start gap-2 text-sm text-fg">
        <input
          id="password-reset-enabled"
          name="enabled"
          type="checkbox"
          checked={enabled}
          disabled={blockers.length > 0 && !enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-0.5 size-4 accent-(--accent)"
        />
        <span className="grid gap-0.5">
          <span className="font-semibold">{t("enabled")}</span>
          <span className="text-muted">{t("enabledHint")}</span>
        </span>
      </label>
      <div>
        <Button type="submit" loading={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
