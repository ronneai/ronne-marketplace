"use client";

import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Notice } from "@/components/ui/Notice";
import type {
  ScannerServiceState,
  ScanServiceProblem,
} from "@/server/domains/settings/models/skill-scan-policy";

/** What starts each compose service, and what makes the proxy read a new scan key (156). */
const START: Record<ScannerServiceState["kind"], string> = {
  static: "docker compose --profile scanner up -d",
  semantic: "docker compose --profile scanner-semantic up -d",
};
const RECREATE_PROXY = "docker compose up -d --force-recreate proxy";

/**
 * Where the scanner is (156): the scanner service at the operator's address, ready with its
 * version or why not, and the semantic one when set. A compose install gets the command to run.
 * An address that can't be used is said first.
 */
export const ScannerService = ({
  services,
  problems = [],
}: {
  services: readonly ScannerServiceState[];
  problems?: readonly ScanServiceProblem[];
}) => {
  const t = useTranslations("admin.settings.scan.command.service");
  return (
    <div className="grid gap-2">
      {problems.map((problem) => (
        <Notice key={problem} kind="warn" title={t(`problem.${problem}`)} />
      ))}
      {services.map((service) => {
        const name = t("name", { kind: service.kind });
        const { health } = service;
        if (health.state === "ready")
          return (
            <p key={service.kind} className="text-sm text-fg">
              {health.version
                ? t("ready", { name, version: health.version })
                : t("readyNoVersion", { name })}
            </p>
          );
        const keyRefused = health.state === "scan key refused";
        const command = keyRefused ? RECREATE_PROXY : START[service.kind];
        return (
          <Notice
            key={service.kind}
            kind="warn"
            title={
              keyRefused
                ? t("keyRefused", { name })
                : t("unreachable", { name, address: service.address })
            }
          >
            {service.compose ? (
              <p>
                {t(keyRefused ? "recreate" : "start")}{" "}
                <code className="font-mono break-all">{command}</code>
              </p>
            ) : null}
            {keyRefused ? null : <Help id="scan-container" />}
          </Notice>
        );
      })}
    </div>
  );
};
