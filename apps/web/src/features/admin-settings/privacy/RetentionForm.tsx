"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { useKeptActionState } from "@/components/ui/kept-form";
import { useToastWhen } from "@/components/ui/toast";
import {
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  type RetentionPolicy,
} from "@/server/domains/settings/models/retention-policy";
import { saveRetention } from "../actions";

/** The three numbers, each with what it covers (`admin.settings.privacy.fields`); Save is on once any changed. */
const FIELDS: readonly { name: keyof RetentionPolicy; id: string }[] = [
  { name: "ipDays", id: "retention-ip" },
  { name: "sessionsDays", id: "retention-sessions" },
  { name: "feedbackDays", id: "retention-feedback" },
];

/**
 * How long personal data is kept (102): root's two numbers of days and Save, audited. The purge
 * runs by them, on its own schedule or from `rmk-server purge`.
 */
export const RetentionForm = ({ retention }: { retention: RetentionPolicy }) => {
  const t = useTranslations("admin.settings.privacy");
  const { state, action, pending, onSubmit } = useKeptActionState(saveRetention, {});
  useToastWhen(state, state.done);
  const [typed, setTyped] = useState<Record<keyof RetentionPolicy, string>>({
    ipDays: String(retention.ipDays),
    sessionsDays: String(retention.sessionsDays),
    feedbackDays: String(retention.feedbackDays),
  });
  const unchanged = FIELDS.every(
    (field) => typed[field.name].trim() === String(retention[field.name]),
  );
  return (
    <form action={action} onSubmit={onSubmit} aria-label={t("ariaLabel")} className="grid gap-4">
      <div className="grid gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          {t("title")} <Help id="retention" />
        </h2>
        <p className="text-sm text-muted">{t("intro")}</p>
      </div>
      {FIELDS.map((field) => (
        <div key={field.name} className="grid gap-1.5">
          <Label htmlFor={field.id}>{t(`fields.${field.name}.label`)}</Label>
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
            <span>{t("days", { count: Number(typed[field.name]) || 0 })}</span>
          </div>
          <p id={`${field.id}-hint`} className="text-xs text-muted">
            {t(`fields.${field.name}.hint`)}
          </p>
        </div>
      ))}
      <FieldError id="retention-error">{state.error}</FieldError>
      <div>
        <Button type="submit" disabled={pending || unchanged}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
