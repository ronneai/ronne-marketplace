"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Label, Select } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type {
  ScannerServiceState,
  ScanSetupShown,
} from "@/server/domains/settings/models/skill-scan-policy";
import { ScannerAddress } from "./ScannerAddress";
import { ScannerService } from "./ScannerService";

/**
 * Which scanner command runs (136): the environment's, shown as set on the server, or one of the
 * operator's list, by position and file name only. With one in the list it's chosen by itself.
 * With the scanner service's address set (156), the service and its state instead: no command runs.
 */
export const ScannerCommand = ({
  setup,
  services,
}: {
  setup: ScanSetupShown;
  services?: readonly ScannerServiceState[];
}) => (
  <div className="grid gap-4">
    <ScannerCommandChoice setup={setup} services={services} />
    <ScannerAddress setup={setup} />
  </div>
);

const ScannerCommandChoice = ({
  setup,
  services,
}: {
  setup: ScanSetupShown;
  services?: readonly ScannerServiceState[];
}) => {
  const t = useTranslations("admin.settings.scan.command");
  // Controlled, so Test connection's form reset leaves the choice as made.
  const [chosen, setChosen] = useState(
    setup.commandDropped ? "" : String(setup.chosenCommand ?? ""),
  );
  if (setup.commandFrom === "service")
    return <ScannerService services={services ?? []} problems={setup.serviceProblems} />;
  // A semantic address with no static one (156): said above the command, which still runs.
  const problems =
    setup.serviceProblems.length > 0 ? (
      <ScannerService services={[]} problems={setup.serviceProblems} />
    ) : null;
  if (setup.commandFrom === "environment")
    return (
      <div className="grid gap-2">
        {problems}
        <p className="text-sm text-muted">{t("fromServer")}</p>
      </div>
    );
  if (setup.commands.length === 0) return problems;
  const only = setup.commands.length === 1 ? setup.commands[0] : undefined;
  return (
    <div className="grid gap-2">
      {problems}
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
