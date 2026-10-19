import { loadConfig } from "../config";
import { type AppAuth, getAppAuth } from "../domains/identity/repositories/auth-instance";
import { RETENTION_JOB } from "./retention-job";
import { type JobStatus, jobStatus } from "./run-job";
import { jobsOff } from "./scheduler";

/** What the Privacy tab shows about the purge (102): its last run, and whether the scheduler is off. */
export type RetentionJobView = JobStatus & {
  /** `RONNE_JOBS=off`: nothing runs on its own; cron must run `rmk-server purge`. */
  schedulerOff: boolean;
};

/** The retention purge's last run, for Admin › Settings › Privacy (the page checks root). */
export const retentionJobStatus = async (
  app: AppAuth = getAppAuth(),
): Promise<RetentionJobView> => {
  const status = await jobStatus({ db: app.db, dialect: app.dialect }, RETENTION_JOB);
  return { ...status, schedulerOff: jobsOff(loadConfig().jobs) };
};
