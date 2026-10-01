"use client";

import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { saveUsageMinimum } from "./actions";
import type { SettingsActionState } from "./types";

/** When item pages show usage (047): from any install or run (0), or from root's minimum. */
export const UsageMinimumForm = ({ minimum }: { minimum: number }) => {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    saveUsageMinimum,
    {},
  );
  const [typed, setTyped] = useState(String(minimum));
  return (
    <form action={action} aria-label="Usage minimum" className="grid gap-4">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="usage-minimum">Show an item&apos;s usage from</Label>
          <Help id="usage-minimum" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
          <input
            id="usage-minimum"
            name="usageMinimum"
            type="number"
            min={0}
            max={10000}
            step={1}
            required
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            aria-describedby="usage-minimum-hint"
            className={`${inputClasses} w-28`}
          />
          <span>installs or runs in 30 days</span>
        </div>
        <p id="usage-minimum-hint" className="text-xs text-muted">
          0 shows usage as soon as there&apos;s any. A higher number keeps a few events from looking
          like a trend, or one team&apos;s habits from showing.
        </p>
      </div>
      <FieldError id="usage-minimum-error">{state.error}</FieldError>
      {state.done ? <Notice kind="info" title={state.done} /> : null}
      <div>
        <Button type="submit" disabled={pending || typed.trim() === String(minimum)}>
          Save
        </Button>
      </div>
    </form>
  );
};
