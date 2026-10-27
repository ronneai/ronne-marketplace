"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { PasswordSignInPolicy } from "@/server/domains/settings/models/password-sign-in-policy";
import { savePasswordSignInPolicy } from "../actions";
import type { SettingsActionState } from "../types";

/** Whether Save may be pressed: a change, confirmed when it takes passwords away. */
export const canSave = (
  chosen: PasswordSignInPolicy,
  policy: PasswordSignInPolicy,
  confirmed: boolean,
) => chosen !== policy && (chosen !== "root_only" || confirmed);

/**
 * Who may sign in with a password (106): Everyone, or Root only. Root only needs an identity
 * provider that's on and has passed its test, and a confirm that says who loses their password
 * sign-in. Root keeps theirs whatever is chosen.
 */
export const PasswordPolicyForm = ({
  policy,
  usableProvider,
  affected,
}: {
  policy: PasswordSignInPolicy;
  /** A provider is on and has passed its test. */
  usableProvider: boolean;
  /** How many people would lose their password sign-in (active, with a password, not root). */
  affected: number;
}) => {
  const t = useTranslations("admin.settings.password");
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    savePasswordSignInPolicy,
    {},
  );
  const [chosen, setChosen] = useState<PasswordSignInPolicy>(policy);
  const [confirmed, setConfirmed] = useState(false);
  const needsConfirm = chosen === "root_only" && policy !== "root_only";
  return (
    <form action={action} aria-label={t("title")} className="grid gap-4">
      <fieldset className="grid gap-3" aria-describedby="password-policy-hint">
        <legend className="mb-1 text-base font-semibold text-fg">
          {t("title")} <Help id="password-lockout" />
        </legend>
        <p id="password-policy-hint" className="text-sm text-muted">
          {t("hint")}
        </p>
        <label className="flex items-start gap-2 text-sm text-fg">
          <input
            type="radio"
            name="passwordSignInPolicy"
            value="everyone"
            checked={chosen === "everyone"}
            onChange={() => setChosen("everyone")}
            className="mt-0.5 size-4 accent-(--accent)"
          />
          <span className="grid gap-0.5">
            <span className="font-semibold">{t("everyone.label")}</span>
            <span className="text-muted">{t("everyone.hint")}</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-fg">
          <input
            type="radio"
            name="passwordSignInPolicy"
            value="root_only"
            checked={chosen === "root_only"}
            onChange={() => setChosen("root_only")}
            disabled={!usableProvider && policy !== "root_only"}
            className="mt-0.5 size-4 accent-(--accent)"
          />
          <span className="grid gap-0.5">
            <span className="font-semibold">{t("rootOnly.label")}</span>
            <span className="text-muted">
              {usableProvider ? t("rootOnly.hint") : t("rootOnly.needsProvider")}
            </span>
          </span>
        </label>
      </fieldset>
      {needsConfirm ? (
        <label className="flex items-start gap-2 text-sm text-fg">
          <input
            type="checkbox"
            name="confirm"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 size-4 accent-(--accent)"
          />
          <span>{t("confirm", { affected })}</span>
        </label>
      ) : null}
      <FieldError id="password-policy-error">{state.error}</FieldError>
      {state.done ? <Notice kind="info" title={state.done} /> : null}
      <div>
        <Button type="submit" loading={pending} disabled={!canSave(chosen, policy, confirmed)}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
