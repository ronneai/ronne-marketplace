import { kyselyOutboxRepository } from "../domains/mail/repositories/kysely-outbox-repository";
import type { MailSetupContext } from "../domains/mail/services/mail-setup";
import { deliverDue } from "../domains/mail/services/outbox";
import { type JobDeps, type JobRun, runJob } from "./run-job";

/** The outbox's job (189): every 30 seconds, the messages due, 50 at a time, under the lease. */
export const MAIL_OUTBOX_JOB = "mail_outbox";

/**
 * Sends what's due under the job's lease, so one run happens at a time across every process. It
 * takes the lease only when a row is due, so an instance with nothing to send reads one row each
 * 30 seconds and writes nothing.
 */
export const runMailOutboxJob = async (
  deps: JobDeps,
  context: MailSetupContext & { ca?: string },
): Promise<JobRun | null> => {
  const now = (deps.now ?? (() => new Date()))();
  if ((await kyselyOutboxRepository(deps.db, deps.dialect).dueIds(now, 1)).length === 0)
    return null;
  return runJob(deps, MAIL_OUTBOX_JOB, async (renew) => {
    const counts = await deliverDue(deps, context, { renew });
    return {
      mailSent: counts.sent,
      mailRetried: counts.retried,
      mailFailed: counts.failed,
      mailDropped: counts.dropped,
    };
  });
};
