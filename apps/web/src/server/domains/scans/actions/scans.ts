import { loadConfig } from "../../../config";
import { isId } from "../../../db/ids";
import { kickSkillScans } from "../../../jobs/scheduler";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { can } from "../../identity/models/permissions";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { skillScanBlockScore, skillScanPolicy } from "../../settings/services/settings";
import { storedScanSetup } from "../../settings/services/skill-scan-setup";
import type { ScanGatePolicy } from "../../submissions/models/scan-gate";
import type { ContentScan } from "../repositories/content-scan-repository";
import { kyselyContentScanRepository } from "../repositories/kysely-content-scan-repository";
import { kyselyScanDismissalRepository } from "../repositories/kysely-scan-dismissal-repository";
import type { Dismissal } from "../repositories/scan-dismissal-repository";
import * as dismissals from "../services/dismissals";
import { canDismiss, canSeeScan } from "../services/dismissals";
import { type ScanSetup, scanCommand, scanSetup } from "../services/scan-setup";
import * as service from "../services/scans";

/**
 * The scanner's setup now (135, 136): the operator's config over root's settings. Its provider's
 * variables hold the key: only the job passes them on, to the scanner.
 */
export const scanSetupNow = async (
  app: Pick<AppAuth, "db" | "dialect">,
  env: Record<string, string | undefined> = process.env,
): Promise<ScanSetup> => {
  const config = loadConfig({ env });
  return scanSetup(
    config.skillScanner,
    await storedScanSetup(kyselySettingsRepository(app.db, app.dialect)),
    config.authSecret,
  );
};

/**
 * Root's settings for the gate on approval (137): whether scanning is on, its types, and the
 * score that blocks. Read once per request, before a decision's transaction.
 */
export const scanGatePolicyNow = async (
  app: Pick<AppAuth, "db" | "dialect">,
): Promise<ScanGatePolicy> => {
  const repo = kyselySettingsRepository(app.db, app.dialect);
  const [policy, blockScore] = await Promise.all([
    skillScanPolicy({ repo }),
    skillScanBlockScore({ repo }),
  ]);
  return { enabled: policy.enabled, types: policy.types, blockScore };
};

/** Only the command to run now: what queuing and the review page need, without opening the key. */
const scanCommandNow = async (
  app: Pick<AppAuth, "db" | "dialect">,
  env: Record<string, string | undefined> = process.env,
): Promise<string[] | null> =>
  scanCommand(
    loadConfig({ env }).skillScanner,
    await storedScanSetup(kyselySettingsRepository(app.db, app.dialect)),
  );

/**
 * The item types a revision sent now is queued for the security scan of (135): root's types when
 * scanning is on and a scanner command is set (the operator's, or one root chose from their list);
 * none otherwise.
 */
export const scanTypesNow = async (
  app: Pick<AppAuth, "db" | "dialect">,
  env: Record<string, string | undefined> = process.env,
): Promise<readonly string[]> => {
  if (!(await scanCommandNow(app, env))) return [];
  const policy = await skillScanPolicy({ repo: kyselySettingsRepository(app.db, app.dialect) });
  return policy.enabled ? policy.types : [];
};

/**
 * Sends with the scan types, then starts the scan job without waiting for it when anything could
 * have been queued. The scan never delays or fails the send.
 */
export const sendingWithScans = async <T>(
  app: Pick<AppAuth, "db" | "dialect">,
  send: (scanTypes: readonly string[]) => Promise<T>,
  /** Starts the scan job; tests pass their own. */
  kick: () => void = () => kickSkillScans(),
): Promise<T> => {
  const scanTypes = await scanTypesNow(app);
  const result = await send(scanTypes);
  if (scanTypes.length > 0) kick();
  return result;
};

/** Root's "Scan again" / "Scan now" on the review page: queues the revision and starts the job. */
export const requestScan = async (
  headers: Headers,
  revisionId: string,
  app: AppAuth = getAppAuth(),
): Promise<boolean> => {
  const user = await getCurrentUser(headers, app);
  const queued = await service.requestScan(
    {
      repo: kyselyContentScanRepository(app.db, app.dialect),
      configured: (await scanCommandNow(app)) !== null,
    },
    { user },
    revisionId,
  );
  if (queued) kickSkillScans();
  return queued;
};

/** What the review page's Security scan panel shows for a revision (135, 137). */
export type ReviewScan = {
  /** The revision's newest scan, or null when it has none (or the viewer can't see it). */
  scan: ContentScan | null;
  /** Root, with a scanner command set, and no scan waiting or running (137: a finished one too). */
  canRequest: boolean;
  /** The findings reviewers marked false positives (137), by position. */
  dismissals: Dismissal[];
  /** Whether the viewer may mark findings: a reviewer of the submission, never its author. */
  canDismiss: boolean;
};

const NO_SCAN: ReviewScan = { scan: null, canRequest: false, dismissals: [], canDismiss: false };

/**
 * The scan of the revision the review page (or the author's page, 137) shows: only to its author
 * or someone who reviews its workspace. Whether root may ask for one, and the false positives.
 */
export const reviewScan = async (
  headers: Headers,
  revisionId: string | null,
  app: AppAuth = getAppAuth(),
): Promise<ReviewScan> => {
  // Not an id: no scan, before any query (a NUL would be a raw PostgreSQL error).
  if (!revisionId || !isId(revisionId)) return NO_SCAN;
  const user = await getCurrentUser(headers, app);
  const scan =
    (await kyselyContentScanRepository(app.db, app.dialect).latestFor([revisionId])).get(
      revisionId,
    ) ?? null;
  const root = can(user, "settings.manage");
  const configured = (await scanCommandNow(app)) !== null;
  const canRequest =
    root && configured && (scan === null || scan.status === "failed" || scan.status === "done");
  if (!scan) return { ...NO_SCAN, canRequest };
  const dismissalRepo = kyselyScanDismissalRepository(app.db, app.dialect);
  const target = await dismissalRepo.target(scan.id);
  if (!target || !canSeeScan(user, target)) return NO_SCAN;
  return {
    scan,
    canRequest,
    dismissals: (await dismissalRepo.dismissals([scan.id])).get(scan.id) ?? [],
    canDismiss: scan.status === "done" && canDismiss(user, target),
  };
};

const dismissalActor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** A reviewer marks one finding of a finished scan a false positive, with a reason (137). */
export const dismissFinding = async (
  headers: Headers,
  input: { scanId: unknown; finding: unknown; reason: unknown },
  app: AppAuth = getAppAuth(),
) =>
  dismissals.dismissFinding(
    { repo: kyselyScanDismissalRepository(app.db, app.dialect) },
    await dismissalActor(headers, app),
    input,
  );

/** A reviewer takes a false-positive mark away (137). */
export const restoreFinding = async (
  headers: Headers,
  input: { scanId: unknown; finding: unknown },
  app: AppAuth = getAppAuth(),
) =>
  dismissals.restoreFinding(
    { repo: kyselyScanDismissalRepository(app.db, app.dialect) },
    await dismissalActor(headers, app),
    input,
  );
