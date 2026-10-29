/**
 * The security scan's gate on approval (137). With scanning on and a threshold root set, the
 * latest revision of a submission whose type is scanned can't be approved while its newest scan
 * scored at or above the threshold, still waits or runs, failed, or doesn't exist: it fails closed,
 * so a scan made to fail isn't a way past it. Root's scan override is the way past. Nothing here
 * reads the database: the service gives it the policy and the scan.
 */

/** Root's settings, as the gate needs them; read once, before the decision's transaction. */
export type ScanGatePolicy = {
  enabled: boolean;
  types: readonly string[];
  /** 1 to 100; null when root set none, and nothing is blocked. */
  blockScore: number | null;
};

/** The latest revision's newest scan, as far as the gate cares; null when it has none. */
export type ScanState = {
  status: "queued" | "running" | "done" | "failed";
  /** The score of a finished scan; null otherwise. */
  score: number | null;
} | null;

/** What blocks: the score, a scan that waits or runs, one that failed, or none at all. */
export const SCAN_BLOCKS = ["score", "pending", "failed", "none"] as const;
export type ScanBlock = (typeof SCAN_BLOCKS)[number];

export type ScanGate =
  | { blocked: false; threshold: number | null }
  | { blocked: true; by: ScanBlock; threshold: number; score: number | null };

const OPEN: ScanGate = { blocked: false, threshold: null };

export const scanGate = (
  policy: ScanGatePolicy | undefined,
  submission: {
    type: string;
    authorId: string;
    /**
     * A personal workspace's owner (114): their own submission there is approved as it's sent,
     * never gated. Anyone else's there (a scope moved in, 115) is gated like any other.
     */
    workspace: { ownerId?: string | null };
  },
  scan: ScanState,
): ScanGate => {
  if (!policy?.enabled || policy.blockScore === null) return OPEN;
  if (submission.workspace.ownerId && submission.workspace.ownerId === submission.authorId)
    return OPEN;
  if (!policy.types.includes(submission.type)) return OPEN;
  const threshold = policy.blockScore;
  if (!scan) return { blocked: true, by: "none", threshold, score: null };
  if (scan.status === "queued" || scan.status === "running")
    return { blocked: true, by: "pending", threshold, score: null };
  if (scan.status === "failed" || scan.score === null)
    return { blocked: true, by: "failed", threshold, score: null };
  return scan.score >= threshold
    ? { blocked: true, by: "score", threshold, score: scan.score }
    : { blocked: false, threshold };
};

/** Why approval is blocked, in English, as the services say it (the web app words it per locale). */
export const scanBlockedEnglish = (
  by: ScanBlock,
  score: number | null,
  threshold: number,
): string => {
  switch (by) {
    case "score":
      return `Approval is blocked: the security scan's score, ${score}, is at or above the threshold, ${threshold}.`;
    case "pending":
      return "Approval waits for the security scan to finish.";
    case "failed":
      return "Approval is blocked: the security scan didn't finish. Scan again, or override.";
    case "none":
      return "Approval is blocked: this revision wasn't scanned. Scan it, or override.";
  }
};
