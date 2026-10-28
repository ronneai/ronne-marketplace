import type { AppConfig } from "../config";
import { checkEndpoint, parseAllowedHosts, type Resolver } from "../domains/scans/models/endpoint";
import type { ScanError } from "../domains/scans/models/scan";
import {
  kyselyContentScanRepository,
  kyselyContentScanRepository as scanRepository,
} from "../domains/scans/repositories/kysely-content-scan-repository";
import {
  commandSkillScanner,
  STALE_SCAN_FOLDER_MS,
  sweepScanFolders,
} from "../domains/scans/services/command-scanner";
import { type ScanSetup, scanSetup } from "../domains/scans/services/scan-setup";
import { runQueuedScans, stuckBefore } from "../domains/scans/services/scans";
import { systemResolver } from "../domains/scans/services/system-resolver";
import { kyselySettingsRepository } from "../domains/settings/repositories/kysely-settings-repository";
import { skillScanPolicy } from "../domains/settings/services/settings";
import { storedScanSetup } from "../domains/settings/services/skill-scan-setup";
import { type JobDeps, type JobRun, runJob } from "./run-job";

/** The security scan of submissions as a job (135): the queue, one scan at a time, under the lease. */
export const SKILL_SCAN_JOB = "skill_scan";

/** What the job needs from the settings file and the environment. */
export type SkillScanConfig = NonNullable<AppConfig["skillScanner"]>;

/** Besides the config (136): the AUTH_SECRET that opens root's key, and the resolver to check with. */
export type SkillScanOptions = { authSecret?: string; resolve?: Resolver };

/** The setup now: the operator's config over root's settings, the key opened for this run only. */
const setupNow = async (
  deps: JobDeps,
  config: SkillScanConfig,
  options: SkillScanOptions,
): Promise<ScanSetup> =>
  scanSetup(
    config,
    await storedScanSetup(kyselySettingsRepository(deps.db, deps.dialect)),
    options.authSecret,
  );

/**
 * Runs the queued scans. Scans already queued run even if root has turned scanning off since:
 * they were asked for. With no command they fail `not configured`, which settings show.
 */
export const runSkillScanJob = async (
  deps: JobDeps,
  config: SkillScanConfig,
  options: SkillScanOptions = {},
): Promise<JobRun> =>
  runJob(deps, SKILL_SCAN_JOB, async (renew) => {
    const policy = await skillScanPolicy({ repo: kyselySettingsRepository(deps.db, deps.dialect) });
    const { command, provider, timeoutSeconds, endpointToCheck } = await setupNow(
      deps,
      config,
      options,
    );
    const semantic = policy.analysis === "semantic" && provider !== null;
    // An endpoint root set is checked again before semantic scans send it anything: DNS can change.
    let refuse: ScanError | null = null;
    if (semantic && endpointToCheck) {
      const checked = await checkEndpoint(endpointToCheck, {
        allowedHosts: parseAllowedHosts(config.httpHosts),
        resolve: options.resolve ?? systemResolver(),
      });
      if (!checked.ok) refuse = "endpoint refused";
    }
    const counts = await runQueuedScans({
      repo: kyselyContentScanRepository(deps.db, deps.dialect),
      scanner: commandSkillScanner({ command, timeoutSeconds, provider }),
      semantic: policy.analysis === "semantic",
      provider,
      timeoutSeconds,
      refuse,
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
  options: SkillScanOptions = {},
): Promise<JobRun | null> => {
  const at = (deps.now ?? (() => new Date()))();
  await sweepScanFolders(new Date(at.getTime() - STALE_SCAN_FOLDER_MS));
  const { timeoutSeconds } = await setupNow(deps, config, options);
  const stuck = stuckBefore(at, timeoutSeconds);
  if (!(await scanRepository(deps.db, deps.dialect).hasWork(stuck))) return null;
  return runSkillScanJob(deps, config, options);
};
