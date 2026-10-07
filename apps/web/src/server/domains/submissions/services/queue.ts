import {
  type ItemType,
  parseManifest,
  type RiskFlag,
  type RiskFlagKind,
  riskFlags,
} from "@ronneai/core";
import type { SortDir } from "../../../db/keyset";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { workspacesWith } from "../../identity/models/permissions";
import { OPEN_STATUSES, type SubmissionStatus } from "../models/status";
import { fileBytes, MANIFEST_PATH, type Submission, toPackageFile } from "../models/submission";
import type { SubmissionRepository } from "../repositories/submission-repository";
import { type Approvability, approvability } from "./bulk-approve";
import { type DecisionOption, decisionsFor } from "./decisions";
import { type DependencyMark, dependenciesOf, marksFor } from "./dependency-marks";
import { withStale } from "./proposals";
import type { SubmissionActor, SubmissionDeps } from "./submissions";

/** The review queue (feature 014): what needs a reviewer, what waits on its author, what's decided. */
export type QueueTab = "needs" | "waiting" | "release" | "decided";

/**
 * Each tab's statuses, and the time it shows and sorts by (062): the first submit for what waits
 * on a reviewer or the author, the last change (the approval, the decision) for the others.
 * Open tabs start oldest first; Decided newest first.
 */
export const QUEUE_TABS: Record<
  QueueTab,
  {
    label: string;
    statuses: readonly SubmissionStatus[];
    time: "submitted" | "updated";
    timeDir: SortDir;
  }
> = {
  needs: { label: "Needs review", statuses: ["submitted"], time: "submitted", timeDir: "asc" },
  waiting: {
    label: "Waiting on the author",
    statuses: ["changes_requested"],
    time: "submitted",
    timeDir: "asc",
  },
  // Approved ones wait here to go out, oldest approval first (055); Decided keeps the closed ones.
  release: { label: "To release", statuses: ["approved"], time: "updated", timeDir: "asc" },
  decided: {
    label: "Decided",
    statuses: ["rejected", "published"],
    time: "updated",
    timeDir: "desc",
  },
};

export const QUEUE_PAGE_SIZE = 50;

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
  /** The row's own decisions (058): request changes and reject, as on its review page. */
  decisions: DecisionOption[];
  /** What it waits on (056): dependencies in review, or blocked. */
  marks: DependencyMark[];
  /** For an approved one (055): who approved it, and when. */
  approved: { by: string; at: Date } | null;
};

export type QueuePage = {
  /** The workspaces the reviewer moderates (every one for root), for the Workspace filter (091). */
  workspaces: { id: string; name: string }[];
  rows: QueueRow[];
  next: string | null;
  previous: string | null;
  total: { count: number; capped: boolean };
};

/** A tab's view (062): sorted by its time or the item name, searched, filtered by type. */
export type QueueQuery = {
  tab: QueueTab;
  sort?: "time" | "name";
  dir?: SortDir;
  size?: number;
  cursor?: string;
  search?: string;
  type?: ItemType;
  /** A workspace's name: only its submissions, when the reviewer moderates it (091). */
  workspace?: string;
};

/**
 * The workspaces whose submissions the actor reviews (091): the ones they moderate, every one for
 * root; ForbiddenError when there are none.
 */
const reviewedWorkspaces = (actor: SubmissionActor): "all" | string[] => {
  const where = workspacesWith(actor.user, "submissions.review");
  if (where !== "all" && where.length === 0) throw new ForbiddenError("submissions.review");
  return where;
};

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

/** Who approved a submission and when: its last approval, an override included. */
const approvalOf = async (repo: SubmissionRepository, submissionId: string) => {
  const event = (await repo.events(submissionId))
    .filter((e) => e.kind === "approve" || e.kind === "override")
    .at(-1);
  return event ? { by: event.actor.name, at: event.createdAt } : null;
};

export const listQueue = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  query: QueueQuery,
): Promise<QueuePage> => {
  const where = reviewedWorkspaces(actor);
  const workspaces = await deps.repo.workspacesNamed(where);
  const picked = query.workspace ? workspaces.find((w) => w.name === query.workspace) : undefined;
  const tab = QUEUE_TABS[query.tab];
  const sort = query.sort ?? "time";
  const filters = {
    statuses: tab.statuses,
    // One workspace when picked; a name the reviewer doesn't moderate matches nothing.
    ...(query.workspace
      ? { workspaceIds: picked ? [picked.id] : [] }
      : where === "all"
        ? {}
        : { workspaceIds: where }),
    search: query.search?.trim().slice(0, 100) || undefined,
    type: query.type,
  };
  const [page, total] = await Promise.all([
    deps.repo.pageForReview({
      ...filters,
      sort: sort === "time" ? tab.time : "name",
      dir: query.dir ?? (sort === "time" ? tab.timeDir : "asc"),
      size: query.size ?? QUEUE_PAGE_SIZE,
      cursor: query.cursor,
    }),
    deps.repo.countForReview(filters),
  ]);
  const shown = page.rows;
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
        approved:
          submission.status === "approved" ? await approvalOf(deps.repo, submission.id) : null,
      };
    }),
  );
  const stale = await withStale(registry, rows);
  return {
    workspaces,
    rows: stale.map((row) => ({
      ...row,
      approvable: approvability(actor, row),
      decisions: decisionsFor(actor, row),
    })),
    next: page.next,
    previous: page.previous,
    total,
  };
};

/** How many submissions wait for a reviewer, for the nav; 0 for anyone who can't review. */
export const countNeedsReview = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
): Promise<number> => {
  const where = workspacesWith(actor.user, "submissions.review");
  if (where !== "all" && where.length === 0) return 0;
  return deps.repo.countByStatus("submitted", where === "all" ? undefined : where);
};
