import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";

/**
 * Your data (104), on the Account page: what the instance holds about you, as one JSON file. A
 * plain link to `GET /account/data`, so it works with JavaScript off; the route answers with the
 * file as an attachment, or says why not (once every 10 minutes).
 */
export const YourDataSection = ({
  lastDownloadedAt = null,
}: {
  lastDownloadedAt?: Date | null;
}) => {
  const t = useTranslations("account.data");
  return (
    <section aria-labelledby="your-data-title" className="grid gap-4">
      <div className="grid gap-1">
        <div className="flex items-center gap-2">
          <h2 id="your-data-title" className="text-base font-semibold text-fg">
            {t("title")}
          </h2>
          <Help id="your-data" />
        </div>
        <p className="text-sm text-muted">{t("description")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <a href="/account/data" className={buttonClasses("secondary")}>
          {t("download")}
        </a>
        {lastDownloadedAt ? (
          <p className="text-sm text-muted">
            {t("lastDownloaded")} <LocalTime value={lastDownloadedAt} />
          </p>
        ) : null}
      </div>
    </section>
  );
};
