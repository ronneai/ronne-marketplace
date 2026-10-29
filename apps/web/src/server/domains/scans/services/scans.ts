import { requirePermission } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import type { ScanError, ScanProvider, SkillScanner } from "../models/scan";
import type { ContentScanRepository } from "../repositories/content-scan-repository";

/**
 * Running the queued security scans (feature 135), one at a time, under the `skill_scan` job's
 * lease. A scan that fails is recorded with its short reason; nothing here ever blocks a submission.
 */
export type ScanJobDeps = {
  repo: ContentScanRepository;
  scanner: SkillScanner;
  /** Whether root chose semantic analysis; it runs only with `provider` set up as well. */
  semantic: boolean;
  provider: ScanProvider | null;
  timeoutSeconds: number;
  /** Fails every scan taken with this reason instead of running it (136: `endpoint refused`). */
  refuse?: ScanError | null;
  now?: () => Date;
  /** Called while a scan runs, so the job keeps its lease (run-job's `renew`). */
  renew?: () => Promise<void>;
  /** How often `renew` is called during a scan; a minute by default. */
  renewEveryMs?: number;
};

/** A stuck scan is retried once, then fails. */
export const MAX_SCAN_ATTEMPTS = 2;
/** At most this many scans per run; the next run takes the rest. */
export const SCANS_PER_RUN = 20;

const now = (deps: ScanJobDeps) => (deps.now ?? (() => new Date()))();

/** A scan `running` since before this is stuck: twice the timeout, with nothing to show for it. */
export const stuckBefore = (at: Date, timeoutSeconds: number): Date =>
  new Date(at.getTime() - 2 * timeoutSeconds * 1000);

/** Runs `work`, calling `renew` every `everyMs` meanwhile; a failed renew stops nothing here. */
const keepingLease = async <T>(deps: ScanJobDeps, work: () => Promise<T>): Promise<T> => {
  const { renew } = deps;
  if (!renew) return work();
  let lost: unknown = null;
  const timer = setInterval(() => {
    renew().catch((error: unknown) => {
      lost = error;
    });
  }, deps.renewEveryMs ?? 60_000);
  try {
    const result = await work();
    // The lease went to another run while this scan ran: stop before the next one.
    if (lost) throw lost;
    return result;
  } finally {
    clearInterval(timer);
  }
};

/**
 * One run: puts stuck scans back (a `running` scan older than twice the timeout), then scans the
 * queue oldest first, up to `SCANS_PER_RUN`.
 */
export const runQueuedScans = async (
  deps: ScanJobDeps,
): Promise<{ scanned: number; failed: number; requeued: number; skipped: number }> => {
  const { repo } = deps;
  const stuck = await repo.recoverStuck(
    stuckBefore(now(deps), deps.timeoutSeconds),
    MAX_SCAN_ATTEMPTS,
    now(deps),
  );
  const counts = { scanned: 0, failed: stuck.failed, requeued: stuck.requeued, skipped: 0 };
  const semantic = deps.semantic && deps.provider !== null;

  for (let i = 0; i < SCANS_PER_RUN; i++) {
    // Before each scan but the first, as run-job renews after each batch: short scans never reach
    // the interval in `keepingLease`, and twenty of them could outlast the lease.
    if (i > 0) await deps.renew?.();
    const scan = await repo.takeNext(now(deps));
    if (!scan) break;
    const files = await repo.revisionFiles(scan.revisionId);
    if (!files) {
      // Withdrawn while it waited: nothing to scan. (A deleted revision takes its row with it.)
      await repo.discard(scan.id);
      counts.skipped++;
      continue;
    }
    const outcome = deps.refuse
      ? { ok: false as const, error: deps.refuse }
      : await keepingLease(deps, () => deps.scanner.scan(files, { semantic }));
    const at = now(deps);
    if (outcome.ok) {
      const llm =
        outcome.result.analysis === "semantic" && deps.provider
          ? { provider: deps.provider.name, model: deps.provider.model }
          : null;
      await repo.finish(scan.id, { ok: true, result: outcome.result, llm }, at);
      await repo.recordLast({ version: outcome.result.scannerVersion }, at);
      counts.scanned++;
    } else {
      await repo.finish(scan.id, outcome, at);
      await repo.recordLast({ error: outcome.error }, at);
      counts.failed++;
    }
  }
  return counts;
};

/**
 * Root asks for a scan of one revision (135: "Scan now" when it wasn't scanned; "Scan again",
 * since 137 over a finished scan too, for a new scanner version or provider). Queued like any
 * other; false when the revision is gone or withdrawn, when its newest scan still waits or runs,
 * or when no scanner command is set.
 */
export const requestScan = async (
  deps: { repo: ContentScanRepository; configured: boolean; now?: () => Date },
  actor: { user: CurrentUser | null },
  revisionId: string,
): Promise<boolean> => {
  requirePermission(actor.user, "settings.manage");
  // With no scanner command nothing would ever take it: it would show "Scanning…" for good.
  if (!deps.configured) return false;
  if (!(await deps.repo.revisionFiles(revisionId))) return false;
  // Not a second one while one waits or runs.
  const latest = (await deps.repo.latestFor([revisionId])).get(revisionId);
  if (latest && (latest.status === "queued" || latest.status === "running")) return false;
  await deps.repo.queue(revisionId, (deps.now ?? (() => new Date()))());
  return true;
};
