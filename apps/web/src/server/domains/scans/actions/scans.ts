import { loadConfig } from "../../../config";
import { kickSkillScans } from "../../../jobs/scheduler";
import { getCurrentUser } from "../../identity/actions/session";
import { can } from "../../identity/models/permissions";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { skillScanPolicy } from "../../settings/services/settings";
import type { ContentScan } from "../repositories/content-scan-repository";
import { kyselyContentScanRepository } from "../repositories/kysely-content-scan-repository";
import { parseScannerCommand } from "../services/command-scanner";
import * as service from "../services/scans";

/**
 * The item types a revision sent now is queued for the security scan of (135): root's types when
 * scanning is on and the operator set a scanner command; none otherwise.
 */
export const scanTypesNow = async (
  app: Pick<AppAuth, "db" | "dialect">,
  env: Record<string, string | undefined> = process.env,
): Promise<readonly string[]> => {
  if (!parseScannerCommand(loadConfig({ env }).skillScanner?.command)) return [];
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
      configured: parseScannerCommand(loadConfig().skillScanner?.command) !== null,
    },
    { user },
    revisionId,
  );
  if (queued) kickSkillScans();
  return queued;
};

/** What the review page's Security scan panel shows for a revision (135). */
export type ReviewScan = {
  /** The revision's newest scan, or null when it has none. */
  scan: ContentScan | null;
  /** Root, with a scanner command set, and the newest scan failed or there is none. */
  canRequest: boolean;
};

/**
 * The scan of the revision the review page shows. The page has already checked the viewer may see
 * the submission; this only reads the scan, and whether root may ask for one.
 */
export const reviewScan = async (
  headers: Headers,
  revisionId: string | null,
  app: AppAuth = getAppAuth(),
): Promise<ReviewScan> => {
  if (!revisionId) return { scan: null, canRequest: false };
  const scan =
    (await kyselyContentScanRepository(app.db, app.dialect).latestFor([revisionId])).get(
      revisionId,
    ) ?? null;
  const root = can(await getCurrentUser(headers, app), "settings.manage");
  const configured = parseScannerCommand(loadConfig().skillScanner?.command) !== null;
  return {
    scan,
    canRequest: root && configured && (scan === null || scan.status === "failed"),
  };
};
