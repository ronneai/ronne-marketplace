import type { ManifestIssue, RiskFlag } from "@ronneai/core";
import { parseManifest, riskFlags } from "@ronneai/core";
import { isId } from "../../../db/ids";
import { can, requirePermission } from "../../identity/models/permissions";
import { SubmissionNotFoundError, SubmissionsError } from "../exceptions/errors";
import {
  type ManifestFieldChange,
  manifestChanges,
  type SuggestedBump,
  suggestBump,
} from "../models/bump";
import { type FileChange, isUnreleased, reviewDiff } from "../models/diff";
import type { ReviewEvent, Revision, RevisionFile } from "../models/review";
import { canTransition, OPEN_STATUSES } from "../models/status";
import { fileBytes, MANIFEST_PATH, type Submission, toPackageFile } from "../models/submission";
import { baseFilesOf, staleVersion } from "./proposals";
import { allIssues, type SubmissionActor, type SubmissionDeps } from "./submissions";

/** Everything the review page, and the author's view of it, shows (feature 014). */
export type ReviewView = {
  submission: Submission & { authorName: string };
  mine: boolean;
  revisions: Revision[];
  /** The latest revision and its files; null before the first submit. */
  current: { number: number; files: RevisionFile[] } | null;
  /** The revision before it, which "Changes since" compares with; null for revision 1. */
  previous: number | null;
  changes: FileChange[];
  /** Files under `.ronne/` that changed too (031): named, not diffed, since they aren't released. */
  unreleased: string[];
  flags: RiskFlag[];
  issues: ManifestIssue[];
  events: ReviewEvent[];
  /** The item's published versions, yanked ones included: the publish dialog's preview (015), and
   * whether the page links to the Versions page (016). */
  published: string[];
  can: { decide: boolean; override: boolean; comment: boolean; publish: boolean };
  /** For a change proposal (017): what it changes against its base version. Null for new items. */
  proposal: ProposalView | null;
};

export type ProposalView = {
  baseVersion: string;
  /** The newer version it has to be rebased onto, or null. */
  stale: string | null;
  /** The latest revision against the base version's files; null if they couldn't be read. */
  changes: FileChange[] | null;
  /** Files under `.ronne/` the proposal has, which the base, a released version, never does. */
  unreleased: string[];
  manifest: ManifestFieldChange[];
  /** The bump the publish dialog suggests. */
  suggested: SuggestedBump | null;
};

const manifestOf = (files: readonly RevisionFile[]): Record<string, unknown> | null => {
  const file = files.find((f) => f.path === MANIFEST_PATH);
  return file ? (parseManifest(new TextDecoder().decode(fileBytes(file))).manifest ?? null) : null;
};

/** A proposal's comparison with its base; the diff is left out if the base can't be read. */
const proposalView = async (
  deps: SubmissionDeps,
  submission: Submission,
  files: readonly RevisionFile[] | null,
): Promise<ProposalView | null> => {
  if (!submission.proposal) return null;
  const registry = deps.registry ?? deps.repo.registry();
  const stale = await staleVersion(registry, submission);
  let base: RevisionFile[] | null = null;
  if (deps.storage && files)
    try {
      base = await baseFilesOf(
        { storage: deps.storage, limits: deps.limits },
        registry,
        submission,
      );
    } catch (error) {
      if (!(error instanceof SubmissionsError)) throw error;
    }
  const before = base ? manifestOf(base) : null;
  const after = files ? manifestOf(files) : null;
  const diff = base && files ? reviewDiff(base, files) : null;
  // The bump is about what's released: a canvas layout isn't a new file of the item.
  const released = (side: readonly RevisionFile[]) =>
    side.map((f) => f.path).filter((path) => !isUnreleased(path));
  return {
    baseVersion: submission.proposal.baseVersion,
    stale,
    changes: diff?.changes ?? null,
    unreleased: diff?.unreleased ?? [],
    manifest: before && after ? manifestChanges(before, after) : [],
    suggested:
      base && files && before && after
        ? suggestBump(
            { manifest: before, paths: released(base) },
            { manifest: after, paths: released(files) },
          )
        : null,
  };
};

/**
 * A submission as a review: the author sees their own, moderators and root (`submissions.review`)
 * any that isn't a draft. Anyone else gets SubmissionNotFoundError. Everything is read from the
 * latest revision, so reviewers see exactly what was submitted.
 */
export const getReview = async (
  deps: SubmissionDeps,
  actor: SubmissionActor,
  id: string,
): Promise<ReviewView> => {
  requirePermission(actor.user, "submissions.create");
  const found = isId(id) ? await deps.repo.find(id) : null;
  const mine = found?.authorId === actor.user?.id;
  const reviewer = can(actor.user, "submissions.review");
  if (!found || !(mine || (reviewer && found.status !== "draft")))
    throw new SubmissionNotFoundError();
  const submission = found;

  const revisions = await deps.repo.revisions(submission.id);
  const latest = revisions.at(-1);
  const before = revisions.at(-2);
  const files = latest ? await deps.repo.revisionFiles(latest.id) : [];
  const previousFiles = before ? await deps.repo.revisionFiles(before.id) : null;
  const manifestFile = files.find((file) => file.path === MANIFEST_PATH);
  const manifest = manifestFile
    ? parseManifest(new TextDecoder().decode(fileBytes(manifestFile))).manifest
    : null;

  const submitted = submission.status === "submitted";
  const approved = submission.status === "approved";
  // Approved: the publish dialog's preview. Published: the link to the Versions page.
  const item =
    approved || submission.status === "published"
      ? await deps.repo.registry().findItem(submission.scope.name, submission.name)
      : null;
  const published = item
    ? (await deps.repo.registry().publishedVersions(item.id)).map((v) => v.version)
    : [];
  const diff = latest ? reviewDiff(previousFiles, files) : { changes: [], unreleased: [] };
  return {
    submission: {
      ...submission,
      authorName: (await deps.repo.userName(submission.authorId)) ?? "A former user",
    },
    mine,
    revisions,
    current: latest ? { number: latest.number, files } : null,
    previous: before?.number ?? null,
    changes: diff.changes,
    unreleased: diff.unreleased,
    flags: manifest ? riskFlags(manifest, files.map(toPackageFile)) : [],
    issues: latest ? await allIssues(deps, deps.repo, submission, files) : [],
    events: await deps.repo.events(submission.id),
    published,
    proposal: await proposalView(deps, submission, latest ? files : null),
    can: {
      decide: reviewer && !mine && submitted && canTransition(submission.status, "approve"),
      override: mine && submitted && can(actor.user, "submissions.override"),
      comment: (reviewer || mine) && OPEN_STATUSES.includes(submission.status),
      publish: approved && (mine || can(actor.user, "submissions.publish")),
    },
  };
};
