"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { askForScan } from "./scan-actions";

/** Root's "Scan now" / "Scan again" (135): queues a scan of the revision. */
export const ScanRequest = ({
  revisionId,
  submissionId,
  again,
}: {
  revisionId: string;
  submissionId: string;
  again: boolean;
}) => {
  const t = useTranslations("author.scan");
  const [state, action, pending] = useActionState(askForScan, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="revisionId" value={revisionId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <Button type="submit" variant="secondary" disabled={pending || state.queued === true}>
        {again ? t("again") : t("now")}
      </Button>
      {state.refused ? <span className="text-xs text-muted">{t("refused")}</span> : null}
    </form>
  );
};
