"use client";

import { useTranslations } from "next-intl";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import type { MailSetupShown } from "@/server/domains/mail/services/mail-setup";
import { reasonKey } from "./reasons";

/**
 * Whether email goes out (189): not set up, set up but untested, working since the last test or
 * delivery, or failing, with the reason by kind and when. Never an address.
 */
export const EmailStatus = ({ status }: { status: MailSetupShown["status"] }) => {
  const t = useTranslations("admin.settings.email.status");
  const r = useTranslations("admin.settings.email.reasons");
  return (
    <div className="grid gap-2">
      <h2 className="text-base font-semibold text-fg">{t("title")}</h2>
      {status === "not_set_up" ? (
        <p className="text-sm text-muted">{t("notSetUp")}</p>
      ) : status === "untested" ? (
        <p className="text-sm text-muted">{t("untested")}</p>
      ) : status.status === "working" ? (
        <Notice
          kind="info"
          title={t.rich("working", { date: () => <LocalTime value={status.at} /> })}
        />
      ) : (
        <Notice
          kind="error"
          title={t.rich("failing", {
            reason: r(reasonKey(status.reason)),
            date: () => <LocalTime value={status.at} />,
          })}
        />
      )}
    </div>
  );
};
