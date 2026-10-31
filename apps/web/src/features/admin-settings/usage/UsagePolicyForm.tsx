"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { useToastWhen } from "@/components/ui/toast";
import type { UsagePolicy } from "@/server/domains/settings/models/usage-policy";
import { saveUsagePolicy } from "../actions";

/** The three usage policies, as root reads them (feature 046); their words are `admin.settings.usage.choices`. */
export const POLICY_CHOICES: readonly UsagePolicy[] = ["off", "choice", "required"];

/** Root's usage policy: one choice and Save. */
export const UsagePolicyForm = ({ policy }: { policy: UsagePolicy }) => {
  const t = useTranslations("admin.settings.usage");
  const { state, action, pending, onSubmit } = useKeptActionState(saveUsagePolicy, {});
  useToastWhen(state, state.done);
  const [chosen, setChosen] = useState<UsagePolicy>(policy);
  return (
    <form action={action} onSubmit={onSubmit} aria-label={t("policyTitle")} className="grid gap-4">
      <fieldset className="grid gap-3" aria-describedby="usage-policy-hint">
        <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
          {t("policyTitle")} <Help id="usage-policy" />
        </legend>
        <p id="usage-policy-hint" className="text-sm text-muted">
          {t("policyHint")}
        </p>
        {POLICY_CHOICES.map((choice) => (
          <label key={choice} className="flex items-start gap-2 text-sm text-fg">
            <input
              type="radio"
              name="usagePolicy"
              value={choice}
              checked={chosen === choice}
              onChange={() => setChosen(choice)}
              className="mt-0.5 size-4 accent-(--accent)"
            />
            <span className="grid gap-0.5">
              <span className="font-semibold">{t(`choices.${choice}.label`)}</span>
              <span className="text-muted">{t(`choices.${choice}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FieldError id="usage-policy-error">{state.error}</FieldError>
      <div>
        <Button type="submit" disabled={pending || chosen === policy}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
