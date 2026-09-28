import type { ManifestIssue, RiskFlag } from "@ronneai/core";
import { parseManifest, riskFlags } from "@ronneai/core";
import { isId } from "../../../db/ids";
import { can, requirePermission } from "../../identity/models/permissions";
import { SubmissionNotFoundError } from "../exceptions/errors";
import { diffRevisions, type FileChange } from "../models/diff";
import type { ReviewEvent, Revision, RevisionFile } from "../models/review";
import { canTransition, OPEN_STATUSES } from "../models/status";
import { fileBytes, MANIFEST_PATH, type Submission, toPackageFile } from "../models/submission";
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
  flags: RiskFlag[];
  issues: ManifestIssue[];
  events: ReviewEvent[];
  /** The item's published versions, yanked ones included, for the publish dialog's preview (015). */
  published: string[];
  can: { decide: boolean; override: boolean; comment: boolean; publish: boolean };
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
  const item = approved
    ? await deps.repo.registry().findItem(submission.scope.name, submission.name)
    : null;
  const published = item
    ? (await deps.repo.registry().publishedVersions(item.id)).map((v) => v.version)
    : [];
  return {
    submission: {
      ...submission,
      authorName: (await deps.repo.userName(submission.authorId)) ?? "A former user",
    },
    mine,
    revisions,
    current: latest ? { number: latest.number, files } : null,
    previous: before?.number ?? null,
    changes: latest ? diffRevisions(previousFiles, files) : [],
    flags: manifest ? riskFlags(manifest, files.map(toPackageFile)) : [],
    issues: latest ? await allIssues(deps, deps.repo, submission, files) : [],
    events: await deps.repo.events(submission.id),
    published,
    can: {
      decide: reviewer && !mine && submitted && canTransition(submission.status, "approve"),
      override: mine && submitted && can(actor.user, "submissions.override"),
      comment: (reviewer || mine) && OPEN_STATUSES.includes(submission.status),
      publish: approved && (mine || can(actor.user, "submissions.publish")),
    },
  };
};
