"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { RegenerateBackupCodes, TurnOffTwoFactor } from "./ManageTwoFactor";
import { SetupFlow } from "./SetupFlow";

export type SecurityStatus = { enabled: boolean; backupCodesLeft: number; hasPassword: boolean };

/**
 * Two-factor on `/account/security` (feature 105), as one client part that knows which step the
 * person is on. Turning it on or off replaces the session, and Next.js then renders the page again
 * with the new status; the step stays this component's own, so the backup codes after the first
 * code (or the "it's off" notice) stay until the person moves on, and only then does the page
 * follow the server's status.
 */
/** Who root's requirement covers (the notice names them: `account.security.required`). */
type RequiredFor = "reviewers" | "everyone";

export const TwoFactorPanel = ({
  status,
  required = null,
  continueTo = null,
}: {
  status: SecurityStatus;
  required?: RequiredFor | null;
  /** Where a held person was going (107's `/device`), offered once it's on. */
  continueTo?: string | null;
}) => {
  const t = useTranslations("account.security");
  const router = useRouter();
  const [phase, setPhase] = useState<"off" | "on">(status.enabled ? "on" : "off");
  // A fresh form after each finished step: the last one's state (codes shown) doesn't come back.
  const [round, setRound] = useState(0);
  const next = (to: "off" | "on") => {
    setPhase(to);
    setRound((r) => r + 1);
    router.refresh();
  };
  // The badge and what's offered follow the server's status; the step the person is finishing
  // (the codes after the first code, the notice after turning off) stays until they move on.
  const enabled = status.enabled;
  return (
    <div className="grid gap-4">
      {required && phase === "off" ? (
        <Notice kind="warn" title={t("required.title")}>
          {t("required.body", { who: required })}
        </Notice>
      ) : null}
      {continueTo && phase === "on" && enabled ? (
        <Notice kind="info" title={t("continue.title")}>
          <p>{t("continue.body")}</p>
          {/* A full page load: the app frame was holding this person here until now. */}
          <a href={continueTo} className={`${buttonClasses("primary")} mt-3`}>
            {t("continue.button")}
          </a>
        </Notice>
      ) : null}
      <Panel padding="lg">
        <section aria-labelledby="two-factor-title" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="two-factor-title" className="text-base font-semibold text-fg">
              {t("panel.title")}
            </h2>
            <Badge tone={enabled ? "accent" : "muted"}>
              {enabled ? t("panel.on") : t("panel.off")}
            </Badge>
          </div>
          {!status.hasPassword ? (
            <Notice kind="info" title={t("panel.companyTitle")}>
              {t("panel.company")}
            </Notice>
          ) : phase === "off" ? (
            <>
              {enabled ? null : <p className="text-sm text-muted">{t("panel.offIntro")}</p>}
              <SetupFlow key={round} onDone={() => next("on")} />
            </>
          ) : enabled ? (
            <p className="text-sm text-muted">
              {t("panel.onIntro")}{" "}
              <span className="text-fg">
                {t("panel.codesLeft", { count: status.backupCodesLeft })}
              </span>
            </p>
          ) : null}
        </section>
      </Panel>
      {phase === "on" && status.hasPassword && enabled ? (
        <Panel padding="lg">
          <section aria-labelledby="backup-title" className="grid gap-3">
            <h2 id="backup-title" className="text-base font-semibold text-fg">
              {t("panel.backupTitle")}
            </h2>
            <RegenerateBackupCodes key={round} onDone={() => next("on")} />
          </section>
        </Panel>
      ) : null}
      {phase === "on" && status.hasPassword ? (
        <Panel padding="lg">
          <section aria-labelledby="turn-off-title" className="grid gap-3">
            <h2 id="turn-off-title" className="text-base font-semibold text-fg">
              {t("panel.turnOffTitle")}
            </h2>
            <TurnOffTwoFactor key={round} onDone={() => next("off")} />
          </section>
        </Panel>
      ) : null}
    </div>
  );
};
