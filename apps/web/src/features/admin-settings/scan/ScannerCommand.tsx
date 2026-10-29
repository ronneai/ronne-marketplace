"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Label, Select } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { ScanSetupShown } from "@/server/domains/settings/models/skill-scan-policy";

/**
 * Which scanner command runs (136): the environment's, shown as set on the server, or one of the
 * operator's list, by position and file name only. With one in the list it's chosen by itself.
 */
export const ScannerCommand = ({ setup }: { setup: ScanSetupShown }) => {
  const t = useTranslations("admin.settings.scan.command");
  // Controlled, so Test connection's form reset leaves the choice as made.
  const [chosen, setChosen] = useState(
    setup.commandDropped ? "" : String(setup.chosenCommand ?? ""),
  );
  if (setup.commandFrom === "environment")
    return <p className="text-sm text-muted">{t("fromServer")}</p>;
  if (setup.commands.length === 0) return null;
  const only = setup.commands.length === 1 ? setup.commands[0] : undefined;
  return (
    <div className="grid gap-2">
      {setup.commandDropped ? <Notice kind="warn" title={t("dropped")} /> : null}
      {only && !setup.commandDropped ? (
        <p className="text-sm text-fg">{t("only", { name: only.name })}</p>
      ) : (
        <div className="grid gap-1.5">
          <Label htmlFor="scan-command">{t("label")}</Label>
          <Select
            id="scan-command"
            name="command"
            value={chosen}
            onChange={(event) => setChosen(event.target.value)}
            aria-describedby="scan-command-hint"
          >
            <option value="">{t("choose")}</option>
            {setup.commands.map((choice) => (
              <option key={choice.index} value={choice.index}>
                {t("option", { position: choice.index + 1, name: choice.name })}
              </option>
            ))}
          </Select>
        </div>
      )}
      <p id="scan-command-hint" className="text-xs text-muted">
        {t("hint")}
      </p>
    </div>
  );
};
