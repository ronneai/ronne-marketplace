import { LocalTime } from "@/components/ui/LocalTime";
import type { RetentionJobView } from "@/server/jobs/actions";

const n = (value: unknown) => (typeof value === "number" ? value.toLocaleString("en-US") : "0");

/**
 * The purge's last run under the Retention form (102): when, and what it cleared; that none has
 * run yet (naming RONNE_JOBS when the scheduler is off, so root can see why); or the last error's
 * name, never its message (a driver's can name a host). The command and the scheduler write the
 * same row, so a cron run shows here too.
 */
export const LastRun = ({ status }: { status: RetentionJobView }) => {
  const { lastRunAt, lastResult, running, schedulerOff } = status;
  let body: React.ReactNode;
  if (!lastRunAt || !lastResult) {
    body = (
      <>
        No run yet.{" "}
        {schedulerOff
          ? "Scheduled jobs are off (RONNE_JOBS): run rmk-server purge from cron."
          : "The first run is 5 minutes after the server starts, then every 6 hours."}
      </>
    );
  } else if (lastResult.status === "failed") {
    body = (
      <>
        Last run <LocalTime value={lastRunAt} /> failed ({lastResult.error}). The server&apos;s logs
        say why; the next run is on schedule.
      </>
    );
  } else {
    const c = lastResult.counts;
    body = (
      <>
        Last run <LocalTime value={lastRunAt} />: cleared {n(c.ipsCleared)} IP addresses and{" "}
        {n(c.emailsCleared)} failed sign-ins&apos; emails; deleted {n(c.sessionsDeleted)} expired
        sessions, {n(c.grantsDeleted)} finished rmk login approvals and {n(c.feedbackDeleted)}{" "}
        handled feedback messages.
      </>
    );
  }
  return (
    <p className="text-sm text-muted" data-testid="retention-last-run">
      {body}
      {running ? " A run is in progress." : null}
    </p>
  );
};
