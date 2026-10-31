"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { useToastWhen } from "@/components/ui/toast";
import type { TwoFactorCoverage } from "@/server/domains/identity/models/two-factor-coverage";
import type { TwoFactorPolicy } from "@/server/domains/settings/models/two-factor-policy";
import { saveTwoFactorPolicy } from "../actions";
import { TWO_FACTOR_CHOICES } from "./two-factor-choices";

/**
 * Root's requirement: one choice and Save, audited. Tightening it signs nobody out: the people it
 * newly covers are held on their Account page until they've set it up.
 */
export const TwoFactorPolicyForm = ({
  policy,
  coverage,
}: {
  policy: TwoFactorPolicy;
  coverage: TwoFactorCoverage;
}) => {
  const t = useTranslations("admin.settings.twoFactor");
  const { state, action, pending, onSubmit } = useKeptActionState(saveTwoFactorPolicy, {});
  useToastWhen(state, state.done);
  const [chosen, setChosen] = useState<TwoFactorPolicy>(policy);
  return (
    <form action={action} onSubmit={onSubmit} aria-label={t("title")} className="grid gap-4">
      <fieldset className="grid gap-3" aria-describedby="two-factor-policy-hint">
        {/* The helper sits under the legend, not in it: WebKit sizes a legend to its content, so a
            long question in Portuguese pushed the page past a 320px phone (133). */}
        <legend className="mb-1 text-base font-semibold text-fg">{t("title")}</legend>
        <Help id="two-factor-policy" />
        <p id="two-factor-policy-hint" className="text-sm text-muted">
          {t("hint")}
        </p>
        {TWO_FACTOR_CHOICES.map((choice) => {
          // What a choice means for the people it covers, from the counts.
          const line = choice === "optional" ? null : t("coverage", coverage[choice]);
          return (
            <label key={choice} className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="twoFactorPolicy"
                value={choice}
                checked={chosen === choice}
                onChange={() => setChosen(choice)}
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{t(`choices.${choice}.label`)}</span>
                <span className="text-muted">{t(`choices.${choice}.hint`)}</span>
                {line ? <span className="text-muted">{line}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <FieldError id="two-factor-policy-error">{state.error}</FieldError>
      <div>
        <Button type="submit" disabled={pending || chosen === policy}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
