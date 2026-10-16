"use client";

import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { TwoFactorCoverage } from "@/server/domains/identity/models/two-factor-coverage";
import type { TwoFactorPolicy } from "@/server/domains/settings/models/two-factor-policy";
import { saveTwoFactorPolicy } from "../actions";
import type { SettingsActionState } from "../types";
import { TWO_FACTOR_CHOICES } from "./two-factor-choices";

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/** What a choice means for the people it covers, from the counts. */
const coverageLine = (choice: TwoFactorPolicy, coverage: TwoFactorCoverage) => {
  if (choice === "optional") return null;
  const { covered, unenrolled } = coverage[choice];
  return unenrolled === 0
    ? `${people(covered)}, all with two-factor on.`
    : `${people(covered)}; ${people(unenrolled)} must set it up at their next visit.`;
};

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
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    saveTwoFactorPolicy,
    {},
  );
  const [chosen, setChosen] = useState<TwoFactorPolicy>(policy);
  return (
    <form action={action} aria-label="Two-factor sign-in" className="grid gap-4">
      <fieldset className="grid gap-3" aria-describedby="two-factor-policy-hint">
        <legend className="mb-1 flex items-center gap-2 text-base font-semibold text-fg">
          Two-factor sign-in <Help id="two-factor-policy" />
        </legend>
        <p id="two-factor-policy-hint" className="text-sm text-muted">
          Who must use a code from an authenticator app after their password. Accounts that sign in
          through a company identity provider follow that provider&apos;s own second step.
        </p>
        {TWO_FACTOR_CHOICES.map((choice) => {
          const line = coverageLine(choice.value, coverage);
          return (
            <label key={choice.value} className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="twoFactorPolicy"
                value={choice.value}
                checked={chosen === choice.value}
                onChange={() => setChosen(choice.value)}
                className="mt-0.5 size-4 accent-(--accent)"
              />
              <span className="grid gap-0.5">
                <span className="font-semibold">{choice.label}</span>
                <span className="text-muted">{choice.hint}</span>
                {line ? <span className="text-muted">{line}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <FieldError id="two-factor-policy-error">{state.error}</FieldError>
      {state.done ? <Notice kind="info" title={state.done} /> : null}
      <div>
        <Button type="submit" disabled={pending || chosen === policy}>
          Save
        </Button>
      </div>
    </form>
  );
};
