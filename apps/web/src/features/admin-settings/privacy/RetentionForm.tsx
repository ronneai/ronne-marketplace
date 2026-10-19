"use client";

import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  type RetentionPolicy,
} from "@/server/domains/settings/models/retention-policy";
import { saveRetention } from "../actions";
import type { SettingsActionState } from "../types";

/** The two numbers, each with what it covers; Save is on once either changed. */
const FIELDS: readonly {
  name: keyof RetentionPolicy;
  id: string;
  label: string;
  hint: string;
}[] = [
  {
    name: "ipDays",
    id: "retention-ip",
    label: "Keep IP addresses for",
    hint: "The client addresses kept with audit events, sessions and rmk login approvals, and the email typed in a failed sign-in. Older ones are cleared; the events stay.",
  },
  {
    name: "sessionsDays",
    id: "retention-sessions",
    label: "Keep expired sessions for",
    hint: "A session that has expired, and a finished rmk login approval. Older ones are deleted.",
  },
];

/**
 * How long personal data is kept (102): root's two numbers of days and Save, audited. The purge
 * runs by them, on its own schedule or from `rmk-server purge`.
 */
export const RetentionForm = ({ retention }: { retention: RetentionPolicy }) => {
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(saveRetention, {});
  const [typed, setTyped] = useState<Record<keyof RetentionPolicy, string>>({
    ipDays: String(retention.ipDays),
    sessionsDays: String(retention.sessionsDays),
  });
  const unchanged = FIELDS.every(
    (field) => typed[field.name].trim() === String(retention[field.name]),
  );
  return (
    <form action={action} aria-label="Retention" className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          Retention <Help id="retention" />
        </h2>
        <p className="text-sm text-muted">
          How long this instance keeps what identifies a person&apos;s connection. A purge runs
          every six hours and clears what is older. Shortening a number clears more at the next run.
        </p>
      </div>
      {FIELDS.map((field) => (
        <div key={field.name} className="grid gap-1.5">
          <Label htmlFor={field.id}>{field.label}</Label>
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
            <input
              id={field.id}
              name={field.name}
              type="number"
              min={MIN_RETENTION_DAYS}
              max={MAX_RETENTION_DAYS}
              step={1}
              required
              value={typed[field.name]}
              onChange={(event) => setTyped({ ...typed, [field.name]: event.target.value })}
              aria-describedby={`${field.id}-hint`}
              className={`${inputClasses} w-28`}
            />
            <span>days</span>
          </div>
          <p id={`${field.id}-hint`} className="text-xs text-muted">
            {field.hint}
          </p>
        </div>
      ))}
      <FieldError id="retention-error">{state.error}</FieldError>
      {state.done ? <Notice kind="info" title={state.done} /> : null}
      <div>
        <Button type="submit" disabled={pending || unchanged}>
          Save
        </Button>
      </div>
    </form>
  );
};
