"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import { useToastWhen } from "@/components/ui/toast";
import { saveUsageMinimum } from "../actions";
import type { SettingsActionState } from "../types";

/** When item pages show usage (047): from any install or run (0), or from root's minimum. */
export const UsageMinimumForm = ({ minimum }: { minimum: number }) => {
  const t = useTranslations("admin.settings.usage");
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    saveUsageMinimum,
    {},
  );
  useToastWhen(state, state.done);
  const [typed, setTyped] = useState(String(minimum));
  return (
    <form action={action} aria-label={t("minimumTitle")} className="grid gap-4">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="usage-minimum">{t("minimumLabel")}</Label>
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
          <span>{t("minimumUnit")}</span>
        </div>
        <p id="usage-minimum-hint" className="text-xs text-muted">
          {t("minimumHint")}
        </p>
      </div>
      <FieldError id="usage-minimum-error">{state.error}</FieldError>
      <div>
        <Button type="submit" disabled={pending || typed.trim() === String(minimum)}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
};
