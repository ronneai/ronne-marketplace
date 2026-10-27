"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { FieldError } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { retryErasures } from "../actions";
import type { SettingsActionState } from "../types";

export type PendingErasureView = { userId: string; startedAt: Date };

/**
 * Erasures whose audit log rewrite wasn't completed (103, on MySQL and MariaDB: the server
 * stopped between the account's erasure and the end of the rewrite). The address is still in
 * some events until Retry, or the retention purge's next run, finishes it. Nothing is shown when
 * there's none.
 */
export const PendingErasures = ({ erasures }: { erasures: readonly PendingErasureView[] }) => {
  const t = useTranslations("admin.settings.privacy.erasures");
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(retryErasures, {});
  if (erasures.length === 0) return state.done ? <Notice kind="info" title={state.done} /> : null;
  const count = erasures.length;
  return (
    <form action={action} aria-label={t("ariaLabel")} className="grid gap-2">
      <Notice kind="warn" title={t("title", { count })}>
        <p>{t("body")}</p>
        <ul className="mt-1 list-disc pl-5">
          {erasures.map((erasure) => (
            <li key={erasure.userId}>
              {t.rich("started", { date: () => <LocalTime value={erasure.startedAt} /> })}
            </li>
          ))}
        </ul>
      </Notice>
      <FieldError id="erasures-error">{state.error}</FieldError>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("retry")}
        </Button>
      </div>
    </form>
  );
};
