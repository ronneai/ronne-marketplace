import { isConfigured, loadConfig } from "../config";
import { getAppDb } from "../db/instance";
import { logger } from "../log";
import { runRetentionJob } from "./retention-job";
import { runSkillScansOn, SKILL_SCAN_JOB } from "./skill-scan-job";

/**
 * The in-process scheduler (feature 102): runs the retention purge 5 minutes after the server
 * starts and every 6 hours after, under the job's lease, so several processes or replicas (111)
 * never run it at once. `RONNE_JOBS=off` turns it off, for an operator who runs `rmk-server
 * purge` from cron instead. Before setup there's no database: each tick checks the settings
 * again, so a setup done while the server runs is picked up at the next tick.
 */
export const FIRST_RUN_MS = 5 * 60 * 1000;
export const EVERY_MS = 6 * 60 * 60 * 1000;
/** The security scan's queue (135) is looked at every minute, from a minute after start. */
export const SCAN_EVERY_MS = 60 * 1000;

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type SchedulerOptions = {
  env?: Record<string, string | undefined>;
  timers?: Timers;
  /** The job to run at each tick; the retention purge by default. */
  run?: () => Promise<unknown>;
  /** Its name in the log; `retention_purge` by default. */
  job?: string;
  /** When the first and each next tick run; the retention purge's by default. */
  firstMs?: number;
  everyMs?: number;
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
 * The security scan's queue (135), with this instance's settings: `runSkillScansOn` says what runs.
 * Without a scanner command the waiting scans still run, and fail `not configured`, which settings
 * show: they never stay "Scanning…" for good.
 */
export const runSkillScans = async (env: Record<string, string | undefined>) => {
  const config = loadConfig({ env });
  if (!isConfigured(config)) return;
  const { db, dialect } = getAppDb(config.databaseUrl);
  await runSkillScansOn({ db, dialect }, config.skillScanner ?? { env: {} }, {
    authSecret: config.authSecret,
  });
};

/** When the scan queue is looked at: a minute after start, then every minute. */
export const SCAN_SCHEDULE = {
  job: SKILL_SCAN_JOB,
  firstMs: SCAN_EVERY_MS,
  everyMs: SCAN_EVERY_MS,
} as const;

/**
 * Starts the ticks and returns a function that stops them. A tick that is still running when the
 * next is due is left alone: the next tick is scheduled only once a run ends, so one process never
 * has two runs at once (the lease covers two processes).
 */
export const startScheduler = (options: SchedulerOptions = {}): (() => void) => {
  const env = options.env ?? process.env;
  const timers = options.timers ?? defaultTimers;
  const run = options.run ?? (() => runRetention(env));
  const job = options.job ?? "retention_purge";
  let stopped = false;
  let handle: unknown;
  const tick = async () => {
    if (stopped) return;
    try {
      await run();
    } catch (error) {
      // runJob never throws; this is for the settings or the connection failing before it.
      log.event("job.failed", { job, ms: 0, err: error });
    }
    if (!stopped) handle = timers.setTimeout(tick, options.everyMs ?? EVERY_MS);
  };
  handle = timers.setTimeout(tick, options.firstMs ?? FIRST_RUN_MS);
  return () => {
    stopped = true;
    timers.clearTimeout(handle);
  };
};

// One scheduler per process, whatever Next.js's bundles do with this module.
const store = globalThis as typeof globalThis & { __ronneJobsStop?: () => void };

/** Stops what `startJobsIfOn` started, so it can start again (tests). */
export const stopJobs = (): void => {
  store.__ronneJobsStop?.();
  store.__ronneJobsStop = undefined;
};

/** What `register()` calls at start: the scheduler, unless `RONNE_JOBS` turns it off. */
export const startJobsIfOn = (
  env: Record<string, string | undefined> = process.env,
  /** For tests: their timers, and what the retention and scan ticks run. */
  options: {
    timers?: Timers;
    runRetention?: () => Promise<unknown>;
    runScans?: () => Promise<unknown>;
  } = {},
): void => {
  if (store.__ronneJobsStop) return;
  if (jobsOff(loadConfig({ env }).jobs)) {
    log.info("Scheduled jobs are off (RONNE_JOBS): run rmk-server purge from cron");
    return;
  }
  const { timers } = options;
  const stopRetention = startScheduler({ env, timers, run: options.runRetention });
  const stopScans = startScheduler({
    env,
    timers,
    ...SCAN_SCHEDULE,
    run: options.runScans ?? (() => runSkillScans(env)),
  });
  store.__ronneJobsStop = () => {
    stopRetention();
    stopScans();
  };
};

// One scan run at a time in this process; a kick during a run asks for one more after it.
const kicks = globalThis as typeof globalThis & {
  __ronneScanRun?: Promise<void>;
  __ronneScanAgain?: boolean;
};

/**
 * Starts the scan job now, without waiting for it (135): called after a submission queued a scan.
 * Does nothing with `RONNE_JOBS=off`; the lease keeps other processes from scanning at once.
 */
export const kickSkillScans = (
  env: Record<string, string | undefined> = process.env,
  /** What a kick runs; tests pass their own. */
  run: (env: Record<string, string | undefined>) => Promise<unknown> = runSkillScans,
): void => {
  if (jobsOff(loadConfig({ env }).jobs)) return;
  if (kicks.__ronneScanRun) {
    kicks.__ronneScanAgain = true;
    return;
  }
  const loop = async () => {
    do {
      kicks.__ronneScanAgain = false;
      try {
        await run(env);
      } catch (error) {
        log.event("job.failed", { job: SKILL_SCAN_JOB, ms: 0, err: error });
      }
    } while (kicks.__ronneScanAgain);
    kicks.__ronneScanRun = undefined;
  };
  kicks.__ronneScanRun = loop();
};
