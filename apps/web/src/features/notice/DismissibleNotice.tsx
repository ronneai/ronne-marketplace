import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Notice } from "@/server/domains/settings/models/notice-policy";
import { dismissNotice } from "./actions";
import { NoticeBanner } from "./NoticeBanner";

/**
 * The instance notice under the header of every signed-in page (124), with a dismiss icon inside
 * the box (owner, 2026-10-21): a form, so it works without JavaScript; the icon is a 44px target
 * on a phone and has the name “Dismiss”.
 */
export const DismissibleNotice = ({ notice }: { notice: Notice }) => {
  const t = useTranslations("shell.notice");
  return (
    <NoticeBanner
      notice={notice}
      action={
        <form action={dismissNotice} className="-m-2 shrink-0">
          <input type="hidden" name="revision" value={notice.revision} />
          <button
            type="submit"
            aria-label={t("dismiss")}
            title={t("dismiss")}
            className="touch-hit inline-flex size-8 items-center justify-center rounded-control text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </form>
      }
    />
  );
};
