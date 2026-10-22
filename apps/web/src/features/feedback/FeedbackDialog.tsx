"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@/components/ui/Dialog";
import { FeedbackForm } from "./FeedbackForm";

/**
 * Send feedback as a dialog (feature 127), opened from the sidebar. The form is only mounted while
 * it is open, so each opening starts empty. Below `sm` the dialog fills the screen (067).
 */
export const FeedbackDialog = ({
  open,
  onClose,
  page,
}: {
  open: boolean;
  onClose: () => void;
  page: string | null;
}) => {
  const t = useTranslations("feedback");
  return (
    <Dialog open={open} onClose={onClose} title={t("title")}>
      {open ? (
        <div className="grid gap-4">
          <p className="text-sm text-muted">{t("intro")}</p>
          <FeedbackForm page={page} onDone={onClose} />
        </div>
      ) : null}
    </Dialog>
  );
};
