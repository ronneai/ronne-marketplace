"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
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
export const TwoFactorPanel = ({ status }: { status: SecurityStatus }) => {
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
      <Panel padding="lg">
        <section aria-labelledby="two-factor-title" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="two-factor-title" className="text-base font-semibold text-fg">
              Two-factor sign-in
            </h2>
            <Badge tone={enabled ? "accent" : "muted"}>{enabled ? "On" : "Off"}</Badge>
          </div>
          {!status.hasPassword ? (
            <Notice kind="info" title="Your company's sign-in protects your account">
              You sign in through your company&apos;s identity provider, which asks for its own
              second step. There&apos;s nothing to set up here.
            </Notice>
          ) : phase === "off" ? (
            <>
              {enabled ? null : (
                <p className="text-sm text-muted">
                  Signing in will also ask for a 6-digit code from an app on your phone, so a stolen
                  password isn&apos;t enough.
                </p>
              )}
              <SetupFlow key={round} onDone={() => next("on")} />
            </>
          ) : enabled ? (
            <p className="text-sm text-muted">
              Signing in with your password also asks for a code from your authenticator app, or one
              of your backup codes.{" "}
              <span className="text-fg">
                {status.backupCodesLeft === 1
                  ? "1 backup code left."
                  : `${status.backupCodesLeft} backup codes left.`}
              </span>
            </p>
          ) : null}
        </section>
      </Panel>
      {phase === "on" && status.hasPassword && enabled ? (
        <Panel padding="lg">
          <section aria-labelledby="backup-title" className="grid gap-3">
            <h2 id="backup-title" className="text-base font-semibold text-fg">
              Backup codes
            </h2>
            <RegenerateBackupCodes key={round} onDone={() => next("on")} />
          </section>
        </Panel>
      ) : null}
      {phase === "on" && status.hasPassword ? (
        <Panel padding="lg">
          <section aria-labelledby="turn-off-title" className="grid gap-3">
            <h2 id="turn-off-title" className="text-base font-semibold text-fg">
              Turn off two-factor sign-in
            </h2>
            <TurnOffTwoFactor key={round} onDone={() => next("off")} />
          </section>
        </Panel>
      ) : null}
    </div>
  );
};
