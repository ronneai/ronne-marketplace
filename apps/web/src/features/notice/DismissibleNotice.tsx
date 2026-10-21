import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import type { Notice } from "@/server/domains/settings/models/notice-policy";
import { dismissNotice } from "./actions";
import { NoticeBanner } from "./NoticeBanner";

/**
 * The instance notice under the header of every signed-in page (124), with its Dismiss button: a
 * form, so it works without JavaScript. The button is a 44px target on a phone.
 */
export const DismissibleNotice = ({ notice }: { notice: Notice }) => {
  const t = useTranslations("shell.notice");
  return (
    <NoticeBanner
      notice={notice}
      action={
        <form action={dismissNotice}>
          <input type="hidden" name="revision" value={notice.revision} />
          <Button type="submit" variant="secondary">
            {t("dismiss")}
          </Button>
        </form>
      }
    />
  );
};
