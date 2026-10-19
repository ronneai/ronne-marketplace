import { createDb } from "../db/create-db";
import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { retentionPolicy } from "../domains/settings/services/settings";
import { runRetentionJob } from "../jobs/retention-job";
import { type PurgeCounts, runRetentionPurge } from "../jobs/retention-purge";
import { scriptCommand } from "../runtime";
import { readEnvFile } from "./env-file";
import { MissingInputError } from "./non-interactive-prompts";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

const n = (value: number) => value.toLocaleString("en-US");

/** The counts, one line each, as the command prints them. */
export const purgeLines = (counts: PurgeCounts): string[] => {
  const ips = counts.ipsCleared;
  return [
    `IP addresses cleared: ${n(ips.auditLog + ips.sessions + ips.deviceGrants)} (audit log ${n(ips.auditLog)}, sessions ${n(ips.sessions)}, device grants ${n(ips.deviceGrants)})`,
    `Failed sign-ins' emails cleared: ${n(counts.emailsCleared)}`,
    `Expired sessions deleted: ${n(counts.sessionsDeleted)}`,
    `Finished device grants deleted: ${n(counts.grantsDeleted)}`,
  ];
};

/** A progress line every this many rows, when stdout is a terminal. */
export const PROGRESS_EVERY = 10_000;

/**
 * Turns the purge's running total (the run's rows so far, across its rules) into one call per
 * PROGRESS_EVERY rows crossed: a batch that crosses two milestones at once reports the last.
 */
export const progressLines = (print: (milestone: number) => void) => {
  let reported = 0;
  return (done: number) => {
    const milestone = Math.floor(done / PROGRESS_EVERY) * PROGRESS_EVERY;
    if (milestone > reported) {
      reported = milestone;
      print(milestone);
    }
  };
};

/**
 * pnpm run purge (102): one retention purge now, by root's settings, under the same lease the
 * server's scheduler takes, so cron and the scheduler never overlap. `--dry-run` counts and
 * changes nothing (and needs no lease). Reads DATABASE_URL from the environment or .env.
 */
export const runPurge = async (options: {
  appDir: string;
  envPath: string;
  prompts: SetupPrompts;
  dryRun: boolean;
  databaseUrl?: string;
  /** Progress lines (a terminal); off otherwise. */
  progress?: boolean;
  now?: () => Date;
}): Promise<PurgeCounts> => {
  const { appDir, envPath, prompts } = options;
  const databaseUrl = options.databaseUrl || readEnvFile(envPath).DATABASE_URL;
  if (!databaseUrl)
    throw new MissingInputError(
      `DATABASE_URL (run \`${scriptCommand("setup")}\` first, or set it)`,
    );
  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  const now = options.now ?? (() => new Date());
  const progress = options.progress
    ? progressLines((milestone) => prompts.log.info(`${n(milestone)} rows so far…`))
    : () => {};
  try {
    const policy = await retentionPolicy({ repo: kyselySettingsRepository(db, dialect) });
    prompts.log.step(
      `${options.dryRun ? "Counting what a purge would clear" : "Purging"} by the retention: IP addresses ${policy.ipDays} days, expired sessions ${policy.sessionsDays} days.`,
    );
    let counts: PurgeCounts;
    if (options.dryRun) {
      counts = await runRetentionPurge(db, dialect, policy, now(), { dryRun: true });
    } else {
      const run = await runRetentionJob({ db, dialect, now }, { onBatch: progress });
      if (run.status === "skipped")
        throw new SetupFailedError(
          "Another purge is running (the server's scheduler, or another rmk-server purge). Try again in a few minutes.",
        );
      if (run.status === "failed")
        throw new SetupFailedError(
          `The purge failed: ${run.error.name}. The server's logs say why.`,
        );
      if (!run.purge) throw new SetupFailedError("The purge ended without its counts.");
      counts = run.purge;
    }
    for (const line of purgeLines(counts)) prompts.log.success(line);
    if (options.dryRun) prompts.log.info("A dry run: nothing was changed.");
    return counts;
  } finally {
    await db.destroy();
  }
};
