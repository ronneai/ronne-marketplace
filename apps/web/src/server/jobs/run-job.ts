import type { Kysely } from "kysely";
import { fromDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { decodeJson, encodeJson } from "../db/json";
import type { Database } from "../db/schema";
import type { DatabaseDialect } from "../db/url";
import { logger } from "../log";
import { claimLease, releaseLease, renewLease } from "./lease";

/**
 * The frame every scheduled job runs in (feature 102): the lease, the log lines, the metric (101
 * records `ronne.job.duration` from the `job.finished` and `job.failed` lines) and the row's
 * `last_run_at` and `last_result`. A job's work gets a `renew` to call after each batch; a run
 * that lost its lease meanwhile is stopped by it. The next scheduled run happens whatever this one
 * did: a failure is logged and recorded, never thrown to the scheduler.
 */
export type JobDeps = { db: Kysely<Database>; dialect: DatabaseDialect; now?: () => Date };

export type JobCounts = Record<string, number>;

/** What `last_result` holds, for the Privacy tab (task 5). */
export type JobLastResult =
  | { at: string; ms: number; status: "ok"; counts: JobCounts }
  | { at: string; ms: number; status: "failed"; error: string };

export type JobRun =
  | { status: "done"; ms: number; counts: JobCounts }
  | { status: "skipped"; reason: "locked" }
  | { status: "failed"; ms: number; error: Error };

/** The job's row as the tab reads it: null while it was never run or claimed. */
export type JobStatus = {
  lastRunAt: Date | null;
  lastResult: JobLastResult | null;
  /** Someone holds the lease right now (a run in progress, or one that died within the lease). */
  running: boolean;
};

/** Thrown inside a job's work when its lease went to another run: the work stops here. */
export class LeaseLostError extends Error {
  override readonly name: string = "LeaseLostError";
  constructor(job: string) {
    super(`The ${job} job's lease went to another run`);
  }
}

const log = logger.child({ domain: "jobs" });

const now = (deps: JobDeps) => (deps.now ?? (() => new Date()))();

/** Runs `work` under the job's lease, once at a time across every process; see above. */
export const runJob = async (
  deps: JobDeps,
  name: string,
  work: (renew: () => Promise<void>) => Promise<JobCounts>,
): Promise<JobRun> => {
  const { db, dialect } = deps;
  const holder = newId();
  const startedAt = now(deps);
  if (!(await claimLease(db, dialect, name, holder, startedAt))) {
    log.event("job.skipped", { job: name, reason: "locked" });
    return { status: "skipped", reason: "locked" };
  }
  log.event("job.started", { job: name });
  const renew = async () => {
    if (!(await renewLease(db, dialect, name, holder, now(deps)))) throw new LeaseLostError(name);
  };
  const started = Date.now();
  try {
    const counts = await work(renew);
    const ms = Date.now() - started;
    const result: JobLastResult = { at: startedAt.toISOString(), ms, status: "ok", counts };
    await releaseLease(db, dialect, name, holder, startedAt, encodeJson(result));
    log.event("job.finished", { job: name, ms, ...counts });
    return { status: "done", ms, counts };
  } catch (error) {
    const ms = Date.now() - started;
    const err = error instanceof Error ? error : new Error(String(error));
    // The error's name, never its message: a driver's can name a host.
    const result: JobLastResult = {
      at: startedAt.toISOString(),
      ms,
      status: "failed",
      error: err.name,
    };
    try {
      await releaseLease(db, dialect, name, holder, startedAt, encodeJson(result));
    } catch {
      // The database is what failed: the lease expires on its own.
    }
    log.event("job.failed", { job: name, ms, err });
    return { status: "failed", ms, error: err };
  }
};

/** The job's last run, for the Privacy tab (task 5). */
export const jobStatus = async (deps: JobDeps, name: string): Promise<JobStatus> => {
  const row = await deps.db
    .selectFrom("jobs")
    .select(["lease_ends_at", "last_run_at", "last_result"])
    .where("name", "=", name)
    .executeTakeFirst();
  if (!row) return { lastRunAt: null, lastResult: null, running: false };
  const leaseEndsAt = fromDbDate(row.lease_ends_at);
  return {
    lastRunAt: fromDbDate(row.last_run_at),
    lastResult: decodeJson<JobLastResult>(row.last_result),
    running: leaseEndsAt !== null && leaseEndsAt.getTime() >= now(deps).getTime(),
  };
};
