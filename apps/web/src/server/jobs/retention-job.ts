import { kyselyEraseRepository } from "../domains/identity/repositories/kysely-erase-repository";
import { finishErasures } from "../domains/identity/services/erase-user";
import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { retentionPolicy } from "../domains/settings/services/settings";
import { type PurgeCounts, runRetentionPurge } from "./retention-purge";
import { type JobCounts, type JobDeps, type JobRun, runJob } from "./run-job";

/** The retention purge as a scheduled job (102): root's policy, read at each run, under the lease. */
export const RETENTION_JOB = "retention_purge";

/**
 * The counts as the log line and `last_result` carry them: the IPs of the three tables added up,
 * and the erasures (103) whose rewrite the run finished.
 */
export const flattenCounts = (counts: PurgeCounts, erasuresFinished = 0): JobCounts => ({
  ipsCleared:
    counts.ipsCleared.auditLog + counts.ipsCleared.sessions + counts.ipsCleared.deviceGrants,
  emailsCleared: counts.emailsCleared,
  sessionsDeleted: counts.sessionsDeleted,
  grantsDeleted: counts.grantsDeleted,
  feedbackDeleted: counts.feedbackDeleted,
  erasuresFinished,
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
    // An erasure interrupted on MySQL (103): the job finishes its rewrite and records its event.
    const erasuresFinished = await finishErasures(
      { repo: kyselyEraseRepository(deps.db, deps.dialect), now: deps.now },
      { job: true },
    );
    return flattenCounts(purge, erasuresFinished);
  });
  return purge ? { ...run, purge } : run;
};
