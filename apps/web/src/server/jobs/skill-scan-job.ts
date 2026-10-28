import type { AppConfig } from "../config";
import {
  kyselyContentScanRepository,
  kyselyContentScanRepository as scanRepository,
} from "../domains/scans/repositories/kysely-content-scan-repository";
import {
  commandSkillScanner,
  parseScannerCommand,
  parseScanTimeout,
  STALE_SCAN_FOLDER_MS,
  scanProvider,
  sweepScanFolders,
} from "../domains/scans/services/command-scanner";
import { runQueuedScans, stuckBefore } from "../domains/scans/services/scans";
import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { skillScanPolicy } from "../domains/settings/services/settings";
import { type JobDeps, type JobRun, runJob } from "./run-job";

/** The security scan of submissions as a job (135): the queue, one scan at a time, under the lease. */
export const SKILL_SCAN_JOB = "skill_scan";

/** What the job needs from the settings file and the environment. */
export type SkillScanConfig = NonNullable<AppConfig["skillScanner"]>;

/**
 * Runs the queued scans. Scans already queued run even if root has turned scanning off since:
 * they were asked for. With no command they fail `not configured`, which settings show.
 */
export const runSkillScanJob = async (deps: JobDeps, config: SkillScanConfig): Promise<JobRun> =>
  runJob(deps, SKILL_SCAN_JOB, async (renew) => {
    const policy = await skillScanPolicy({ repo: kyselySettingsRepository(deps.db, deps.dialect) });
    const timeoutSeconds = parseScanTimeout(config.timeout);
    const provider = scanProvider(config.env);
    const counts = await runQueuedScans({
      repo: kyselyContentScanRepository(deps.db, deps.dialect),
      scanner: commandSkillScanner({
        command: parseScannerCommand(config.command),
        timeoutSeconds,
        provider,
      }),
      semantic: policy.analysis === "semantic",
      provider,
      timeoutSeconds,
      now: deps.now,
      renew,
    });
    return counts;
  });

/**
 * What the scheduler and a kick run (135). First the folder sweep: `ronne-scan-*` folders a dead
 * process left, older than any instance's scan can last (no lease needed: it touches only stale
 * folders). Then the job, but only when it has work, a scan waiting or one stuck since Ronne's
 * process died, so an instance that doesn't scan takes no lease and reads one row a minute.
 */
export const runSkillScansOn = async (
  deps: JobDeps,
  config: SkillScanConfig,
): Promise<JobRun | null> => {
  const at = (deps.now ?? (() => new Date()))();
  await sweepScanFolders(new Date(at.getTime() - STALE_SCAN_FOLDER_MS));
  const stuck = stuckBefore(at, parseScanTimeout(config.timeout));
  if (!(await scanRepository(deps.db, deps.dialect).hasWork(stuck))) return null;
  return runSkillScanJob(deps, config);
};
