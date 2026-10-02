import { parseManifest, type RiskFlag, type RiskFlagKind, riskFlags } from "@ronneai/core";
import { requirePermission } from "../../identity/models/permissions";
import { OPEN_STATUSES, type SubmissionStatus } from "../models/status";
import { fileBytes, MANIFEST_PATH, type Submission, toPackageFile } from "../models/submission";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { type Approvability, approvability } from "./bulk-approve";
import { type DependencyMark, dependenciesOf, marksFor } from "./dependency-marks";
import { withStale } from "./proposals";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/** The review queue (feature 014): what needs a reviewer, what waits on its author, what's decided. */
export type QueueTab = "needs" | "waiting" | "decided";

export const QUEUE_TABS: Record<
  QueueTab,
  { label: string; statuses: readonly SubmissionStatus[]; order: "oldest" | "newest" }
> = {
  needs: { label: "Needs review", statuses: ["submitted"], order: "oldest" },
  waiting: { label: "Waiting on the author", statuses: ["changes_requested"], order: "oldest" },
  decided: { label: "Decided", statuses: ["approved", "rejected", "published"], order: "newest" },
};

/** Open tabs are small and shown whole; Decided pages. */
const OPEN_LIMIT = 200;
export const DECIDED_PAGE_SIZE = 50;

export type QueueRow = Submission & {
  authorName: string;
  /** For a change proposal (017): the newer version it has to be rebased onto, or null. */
  stale: string | null;
  revision: number | null;
  risky: boolean;
  /** Each kind of risk flag once, for approving many (054): risky ones are listed first. */
  riskKinds: RiskFlagKind[];
  mine: boolean;
  /** Whether this reviewer can approve it now, and why not (054). */
  approvable: Approvability;
  /** What it waits on (056): dependencies in review, or blocked. */
  marks: DependencyMark[];
};

export type QueuePage = { rows: QueueRow[]; nextCursor: string | null };

/** The latest revision's risk flags: what reviewers are asked to look at (MVP §12). */
export const latestRiskFlags = async (
  repo: SubmissionRepository,
  submissionId: string,
): Promise<{ revision: number | null; flags: RiskFlag[] }> => {
  const latest = (await repo.revisions(submissionId)).at(-1);
  if (!latest) return { revision: null, flags: [] };
  const files = await repo.revisionFiles(latest.id);
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
    : null;
  return {
    revision: latest.number,
    flags: manifest ? riskFlags(manifest, files.map(toPackageFile)) : [],
  };
};

/** `updatedAt|id` of the last row, to continue the Decided tab after it. */
const cursorOf = (row: Submission) => `${row.updatedAt.toISOString()}|${row.id}`;
const afterCursor = (cursor: string | undefined) => {
  const [at, id] = (cursor ?? "").split("|");
  const updatedAt = new Date(at ?? "");
  return id && !Number.isNaN(updatedAt.getTime()) ? { updatedAt, id } : undefined;
};

export const listQueue = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  query: { tab: QueueTab; cursor?: string },
): Promise<QueuePage> => {
  requirePermission(actor.user, "submissions.review");
  const tab = QUEUE_TABS[query.tab];
  const paged = query.tab === "decided";
  const limit = paged ? DECIDED_PAGE_SIZE + 1 : OPEN_LIMIT;
  const found = await deps.repo.listForReview({
    statuses: tab.statuses,
    order: tab.order,
    limit,
    after: paged ? afterCursor(query.cursor) : undefined,
  });
  const shown = paged ? found.slice(0, DECIDED_PAGE_SIZE) : found;
  const registry = deps.registry ?? deps.repo.registry();
  const rows = await Promise.all(
    shown.map(async (submission) => {
      const { revision, flags } = await latestRiskFlags(deps.repo, submission.id);
      return {
        ...submission,
        revision,
        risky: flags.length > 0,
        riskKinds: [...new Set(flags.map((flag) => flag.kind))],
        mine: submission.authorId === actor.user?.id,
        marks: OPEN_STATUSES.includes(submission.status)
          ? await marksFor(registry, await dependenciesOf(deps.repo, submission))
          : [],
      };
    }),
  );
  const last = rows.at(-1);
  const stale = await withStale(registry, rows);
  return {
    rows: stale.map((row) => ({ ...row, approvable: approvability(actor, row) })),
    nextCursor: paged && found.length > DECIDED_PAGE_SIZE && last ? cursorOf(last) : null,
  };
};

/** How many submissions wait for a reviewer, for the nav; 0 for anyone who can't review. */
export const countNeedsReview = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
): Promise<number> => {
  try {
    requirePermission(actor.user, "submissions.review");
  } catch {
    return 0;
  }
  return deps.repo.countByStatus("submitted");
};
