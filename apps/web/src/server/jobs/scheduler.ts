import { isConfigured, loadConfig } from "../config";
import { getAppDb } from "../db/instance";
import { logger } from "../log";
import { runRetentionJob } from "./retention-job";

/**
 * The in-process scheduler (feature 102): runs the retention purge 5 minutes after the server
 * starts and every 6 hours after, under the job's lease, so several processes or replicas (111)
 * never run it at once. `RONNE_JOBS=off` turns it off, for an operator who runs `rmk-server
 * purge` from cron instead. Before setup there's no database: each tick checks the settings
 * again, so a setup done while the server runs is picked up at the next tick.
 */
export const FIRST_RUN_MS = 5 * 60 * 1000;
export const EVERY_MS = 6 * 60 * 60 * 1000;

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type SchedulerOptions = {
  env?: Record<string, string | undefined>;
  timers?: Timers;
  /** The job to run at each tick; the retention purge by default. */
  run?: () => Promise<unknown>;
};

const log = logger.child({ domain: "jobs" });

/** Whether `RONNE_JOBS` turns the scheduler off: `off` (any case), `0` or `false`. */
export const jobsOff = (value: string | undefined): boolean =>
  ["off", "0", "false"].includes((value ?? "").trim().toLowerCase());

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => {
    const handle = setTimeout(fn, ms);
    // Never keeps the process alive on its own: a server that is stopping stops.
    handle.unref();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

const runRetention = async (env: Record<string, string | undefined>) => {
  const config = loadConfig({ env });
  if (!isConfigured(config)) {
    log.debug("Jobs skipped: the instance isn't set up yet");
    return;
  }
  const { db, dialect } = getAppDb(config.databaseUrl);
  await runRetentionJob({ db, dialect });
};

/**
 * Starts the ticks and returns a function that stops them. A tick that is still running when the
 * next is due is left alone: the next tick is scheduled only once a run ends, so one process never
 * has two runs at once (the lease covers two processes).
 */
export const startScheduler = (options: SchedulerOptions = {}): (() => void) => {
  const env = options.env ?? process.env;
  const timers = options.timers ?? defaultTimers;
  const run = options.run ?? (() => runRetention(env));
  let stopped = false;
  let handle: unknown;
  const tick = async () => {
    if (stopped) return;
    try {
      await run();
    } catch (error) {
      // runJob never throws; this is for the settings or the connection failing before it.
      log.event("job.failed", { job: "retention_purge", ms: 0, err: error });
    }
    if (!stopped) handle = timers.setTimeout(tick, EVERY_MS);
  };
  handle = timers.setTimeout(tick, FIRST_RUN_MS);
  return () => {
    stopped = true;
    timers.clearTimeout(handle);
  };
};

// One scheduler per process, whatever Next.js's bundles do with this module.
const store = globalThis as typeof globalThis & { __ronneJobsStop?: () => void };

/** What `register()` calls at start: the scheduler, unless `RONNE_JOBS` turns it off. */
export const startJobsIfOn = (env: Record<string, string | undefined> = process.env): void => {
  if (store.__ronneJobsStop) return;
  if (jobsOff(loadConfig({ env }).jobs)) {
    log.info("Scheduled jobs are off (RONNE_JOBS): run rmk-server purge from cron");
    return;
  }
  store.__ronneJobsStop = startScheduler({ env });
};
