"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TextField } from "@/components/ui/Field";
import type { ScanSetupShown } from "@/server/domains/settings/models/skill-scan-policy";

/** How long a scan may run (136): root's, unless the environment sets it. Digits only. */
export const TimeoutField = ({ setup }: { setup: ScanSetupShown }) => {
  const t = useTranslations("admin.settings.scan.timeout");
  // Controlled, so Test connection's form reset leaves it as typed.
  const [value, setValue] = useState(
    setup.timeoutFrom === "settings" ? String(setup.timeoutSeconds) : "",
  );
  if (setup.timeoutFrom === "environment")
    return (
      <p className="text-sm text-muted">{t("fromServer", { seconds: setup.timeoutSeconds })}</p>
    );
  return (
    <TextField
      id="scan-timeout"
      name="timeout"
      label={t("label")}
      hint={t("hint")}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
};
