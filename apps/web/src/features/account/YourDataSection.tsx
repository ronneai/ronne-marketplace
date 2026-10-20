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
}) => (
  <section aria-labelledby="your-data-title" className="grid gap-4">
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <h2 id="your-data-title" className="text-base font-semibold text-fg">
          Your data
        </h2>
        <Help id="your-data" />
      </div>
      <p className="text-sm text-muted">
        Everything this instance holds about you in one JSON file: your account, sessions, token
        names, workspaces, items, submissions, comments and audit events. It isn&apos;t a backup,
        and other people&apos;s data isn&apos;t in it. You can download it once every 10 minutes. A
        list over 10,000 rows is cut, and the file says so at the top; ask root for a database
        export if you need more.
      </p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <a href="/account/data" className={buttonClasses("secondary")}>
        Download my data
      </a>
      {lastDownloadedAt ? (
        <p className="text-sm text-muted">
          Last downloaded <LocalTime value={lastDownloadedAt} />
        </p>
      ) : null}
    </div>
  </section>
);
