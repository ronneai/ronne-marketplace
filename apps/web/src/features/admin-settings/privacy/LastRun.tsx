import { useTranslations } from "next-intl";
import { LocalTime } from "@/components/ui/LocalTime";
import type { RetentionJobView } from "@/server/jobs/actions";

const n = (value: unknown): number => (typeof value === "number" ? value : 0);

/**
 * The purge's last run under the Retention form (102): when, and what it cleared; that none has
 * run yet (naming RONNE_JOBS when the scheduler is off, so root can see why); or the last error's
 * name, never its message (a driver's can name a host). The command and the scheduler write the
 * same row, so a cron run shows here too.
 */
export const LastRun = ({ status }: { status: RetentionJobView }) => {
  const t = useTranslations("admin.settings.privacy.lastRun");
  const { lastRunAt, lastResult, running, schedulerOff } = status;
  let body: React.ReactNode;
  if (!lastRunAt || !lastResult) {
    body = (
      <>
        {t("none")} {schedulerOff ? t("schedulerOff") : t("firstRun")}
      </>
    );
  } else if (lastResult.status === "failed") {
    const error = lastResult.error;
    body = t.rich("failed", { date: () => <LocalTime value={lastRunAt} />, error });
  } else {
    const c = lastResult.counts;
    body = t.rich("done", {
      date: () => <LocalTime value={lastRunAt} />,
      ips: n(c.ipsCleared),
      emails: n(c.emailsCleared),
      sessions: n(c.sessionsDeleted),
      grants: n(c.grantsDeleted),
      feedback: n(c.feedbackDeleted),
      // A result stored before 139 has no such count.
      notifications: n(c.notificationsDeleted ?? 0),
    });
  }
  return (
    <p className="text-sm text-muted" data-testid="retention-last-run">
      {body}
      {running ? ` ${t("running")}` : null}
    </p>
  );
};
