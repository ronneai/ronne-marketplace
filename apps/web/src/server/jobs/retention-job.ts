import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { retentionPolicy } from "../domains/settings/services/settings";
import { type PurgeCounts, runRetentionPurge } from "./retention-purge";
import { type JobCounts, type JobDeps, type JobRun, runJob } from "./run-job";

/** The retention purge as a scheduled job (102): root's policy, read at each run, under the lease. */
export const RETENTION_JOB = "retention_purge";

/** The counts as the log line and `last_result` carry them: the IPs of the three tables added up. */
export const flattenCounts = (counts: PurgeCounts): JobCounts => ({
  ipsCleared:
    counts.ipsCleared.auditLog + counts.ipsCleared.sessions + counts.ipsCleared.deviceGrants,
  emailsCleared: counts.emailsCleared,
  sessionsDeleted: counts.sessionsDeleted,
  grantsDeleted: counts.grantsDeleted,
});

/** The run, with the purge's own counts (per table) when it ran: the command prints those. */
export type RetentionRun = JobRun & { purge?: PurgeCounts };

export const runRetentionJob = async (
  deps: JobDeps,
  options: { onBatch?: (done: number) => void } = {},
): Promise<RetentionRun> => {
  let purge: PurgeCounts | undefined;
  const run = await runJob(deps, RETENTION_JOB, async (renew) => {
    const policy = await retentionPolicy({
      repo: kyselySettingsRepository(deps.db, deps.dialect),
    });
    const at = (deps.now ?? (() => new Date()))();
    purge = await runRetentionPurge(deps.db, deps.dialect, policy, at, {
      onBatch: async (done) => {
        await renew();
        options.onBatch?.(done);
      },
    });
    return flattenCounts(purge);
  });
  return purge ? { ...run, purge } : run;
};
