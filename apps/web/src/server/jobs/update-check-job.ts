import { runUpdateCheck, type UpdateCheckDeps } from "../updates/update-check";
import { type JobDeps, type JobRun, runJob } from "./run-job";

/** The upgrade check as a job (140): once a day, under the lease, so one replica asks GitHub. */
export const UPDATE_CHECK_JOB = "update_check";

export const runUpdateCheckJob = async (
  deps: JobDeps,
  check: Omit<UpdateCheckDeps, "db" | "dialect" | "now">,
): Promise<JobRun> =>
  runJob(deps, UPDATE_CHECK_JOB, async () => {
    const outcome = await runUpdateCheck({ ...deps, ...check });
    return {
      skipped: outcome.status === "off" ? 1 : 0,
      failed: outcome.status === "failed" ? 1 : 0,
      notified: outcome.status === "checked" ? outcome.notified : 0,
    };
  });
