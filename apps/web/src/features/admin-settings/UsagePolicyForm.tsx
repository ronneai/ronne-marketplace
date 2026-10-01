"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { UsagePolicy } from "@/server/domains/settings/models/usage-policy";
import { saveUsagePolicy } from "./actions";
import type { SettingsActionState } from "./types";

/** The three usage policies, as root reads them (feature 046). */
export const POLICY_CHOICES: readonly { value: UsagePolicy; label: string; hint: string }[] = [
  {
    value: "off",
    label: "Off",
    hint: "rmk reports nothing, and this instance refuses usage reports.",
  },
  {
    value: "choice",
    label: "People choose",
    hint: "rmk reports usage counts unless the person turns it off with rmk telemetry off.",
  },
  {
    value: "required",
    label: "Required",
    hint: "Every rmk that installs from this instance reports usage counts; people can't turn it off.",
  },
];

/** Root's usage policy: one choice and Save. */
export const UsagePolicyForm = ({ policy }: { policy: UsagePolicy }) => {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    saveUsagePolicy,
    {},
  );
  const [chosen, setChosen] = useState<UsagePolicy>(policy);
  return (
    <form action={action} className="grid gap-4">
      <fieldset className="grid gap-3" aria-describedby="usage-policy-hint">
        <legend className="mb-1 text-sm font-semibold text-fg">Usage reporting</legend>
        <p id="usage-policy-hint" className="text-sm text-muted">
          Counts of installs, removals and runs of the items rmk installed from this instance, by
          day, item, version and tool. Never who, where, or what was asked.
        </p>
        {POLICY_CHOICES.map((choice) => (
          <label key={choice.value} className="flex items-start gap-2 text-sm text-fg">
            <input
              type="radio"
              name="usagePolicy"
              value={choice.value}
              checked={chosen === choice.value}
              onChange={() => setChosen(choice.value)}
              className="mt-0.5 size-4 accent-(--accent)"
            />
            <span className="grid gap-0.5">
              <span className="font-semibold">{choice.label}</span>
              <span className="text-muted">{choice.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <FieldError id="usage-policy-error">{state.error}</FieldError>
      {state.done ? <Notice kind="info" title={state.done} /> : null}
      <div>
        <Button type="submit" disabled={pending || chosen === policy}>
          Save
        </Button>
      </div>
    </form>
  );
};
