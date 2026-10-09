import { History } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { selectedFile, showFiles } from "@/components/files/shown";
import { Help } from "@/components/help/Help";
import { RiskSummary } from "@/components/risk-flags/RiskSummary";
import { DependencyMarksNotice } from "@/components/submissions/DependencyMarks";
import { ProposalBadges } from "@/components/submissions/ProposalBadges";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { IssueList } from "@/components/validation/IssueList";
import { WithdrawButton } from "@/features/draft-editor/SubmitDialogs";
import { Conversation } from "@/features/reviews/Conversation";
import { DecisionBar } from "@/features/reviews/DecisionBar";
import { ProposalChanges } from "@/features/reviews/ProposalChanges";
import { PublishDialog } from "@/features/reviews/PublishDialog";
import { ReviewAllFiles, ReviewChanges } from "@/features/reviews/ReviewFiles";
import { releaseGroupFor } from "@/features/reviews/release-group";
import { versionsPath } from "@/features/versions/links";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { canInSome } from "@/server/domains/identity/models/permissions";
import { getReview, type ReviewView } from "@/server/domains/submissions/actions/reviews";
import { dependencyMarks } from "@/server/domains/submissions/actions/submissions";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { isUnreleased } from "@/server/domains/submissions/models/diff";
import type { RevisionFile } from "@/server/domains/submissions/models/review";
import { canTransition } from "@/server/domains/submissions/models/status";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Review · Ronne AI Marketplace" };

const viewTab =
  "rounded-control px-3 py-1.5 text-sm text-muted hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg";

/** A revision's file as the file viewer reads it (058): text, or binary. */
const toContent = (file: RevisionFile) =>
  file.encoding === "utf8"
    ? {
        path: file.path,
        size: file.size,
        executable: file.executable,
        kind: "text" as const,
        text: file.content,
      }
    : { path: file.path, size: file.size, executable: file.executable, kind: "binary" as const };

/**
 * The review page (feature 014): moderators and root; anyone else gets a 404. The files, the risk
 * summary and the checks come from the latest revision, so this is exactly what was submitted.
 */
const Review = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const request = await requestHeaders();
  if (!canInSome(await getCurrentUser(request), "submissions.review")) notFound();
  const { id } = await params;
  let review: ReviewView;
  try {
    review = await getReview(request, id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  const { submission, current, previous, proposal } = review;
  // What it waits on (056): reviewers see it before approving.
  const marks = (await dependencyMarks(request, [submission]))[submission.id];
  // What goes out with it, or why it can't go yet (112).
  const release = review.can.publish ? await releaseGroupFor(request, id) : null;
  // A proposal (017) opens on its changes to its base version. Otherwise, changes since the last
  // revision by default from revision 2 on; revision 1 is all files.
  const defaultView = proposal ? "base" : previous === null ? "all" : "changes";
  const query = await searchParams;
  const asked = query.view;
  // The file shown, and the line a risk flag's link opens it at (058).
  const fileParam = typeof query.file === "string" ? query.file : undefined;
  const lineParam = typeof query.line === "string" ? Number.parseInt(query.line, 10) : Number.NaN;
  const view =
    asked === "all" || (asked === "changes" && previous !== null) || (asked === "base" && proposal)
      ? asked
      : defaultView;
  const base = `/reviews/${submission.id}`;
  const viewHref = (v: string) => (v === defaultView ? base : `${base}?view=${v}`);
  // What's released: `.ronne/` (the canvas layout) is the editor's, not the reviewer's (058).
  const files = current
    ? showFiles(current.files.filter((f) => !isUnreleased(f.path)).map(toContent))
    : [];
  // Every decision a reviewer may make here, disabled with the reason when it isn't theirs (058).
  const decisions = review.decisions;

  return (
    <div className="grid gap-6">
      <nav aria-label="Breadcrumb" className="font-mono text-xs text-muted">
        <Link href="/reviews" className="hover:text-fg hover:underline">
          Reviews
        </Link>{" "}
        / <span className="text-fg">{itemNameOf(submission)}</span>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="font-mono text-xl font-semibold text-fg">{itemNameOf(submission)}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <TypeBadge type={submission.type} />
            <StatusBadge status={submission.status} />
            <ProposalBadges proposal={submission.proposal} stale={proposal?.stale} />
            <span>
              by <span className="text-fg">{submission.authorName}</span>
              {review.mine ? " (you)" : ""}
            </span>
            {current ? <span className="font-mono text-xs">revision {current.number}</span> : null}
            {submission.submittedAt ? (
              <span className="font-mono text-xs">
                submitted <LocalTime value={submission.submittedAt} />
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review.published.length > 0 ? (
            <Link href={versionsPath(submission)} className={buttonClasses("secondary")}>
              <History size={16} aria-hidden="true" />
              View versions
            </Link>
          ) : null}
          {/* The author can pull it back from here too, until it's released (058). */}
          {review.mine && canTransition(submission.status, "withdraw") ? (
            <WithdrawButton draftId={submission.id} itemName={itemNameOf(submission)} />
          ) : null}
          <DecisionBar
            id={submission.id}
            name={itemNameOf(submission)}
            decisions={decisions}
            dependents={review.dependents}
            revision={current?.number ?? null}
          />
          {review.can.publish ? (
            <PublishDialog
              id={submission.id}
              itemName={itemNameOf(submission)}
              published={review.published}
              versionsHref={versionsPath(submission)}
              suggested={proposal?.suggested ?? null}
              blocked={release?.blocked ?? null}
              goesWith={release?.goesWith ?? []}
            />
          ) : null}
        </div>
      </header>
      {decisions.length > 0 ? <Help id="decisions" /> : null}
      {review.mine && submission.status === "submitted" ? (
        <p className="text-sm text-muted">
          This is your own submission: another moderator or root reviews it.
          {review.can.override
            ? " As root, you can approve it yourself as an override, recorded as one."
            : ""}
        </p>
      ) : null}

      {proposal?.stale ? (
        <Notice
          kind="warn"
          title={`${proposal.stale} has been released since this proposal started.`}
        >
          It changes {proposal.baseVersion}, so approving it now would undo what {proposal.stale}{" "}
          changed. The author rebases it onto {proposal.stale} first.
        </Notice>
      ) : null}

      <DependencyMarksNotice marks={marks} />

      <RiskSummary flags={review.flags} base={base} />

      {current ? (
        <section aria-labelledby="files" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="files" className="text-lg font-semibold text-fg">
              Files
            </h2>
            <nav aria-label="Files view" className="flex flex-wrap gap-1">
              {proposal ? (
                <Link
                  href={viewHref("base")}
                  aria-current={view === "base" ? "page" : undefined}
                  className={viewTab}
                >
                  Changes to {proposal.baseVersion}
                </Link>
              ) : null}
              {previous !== null ? (
                <Link
                  href={viewHref("changes")}
                  aria-current={view === "changes" ? "page" : undefined}
                  className={viewTab}
                >
                  Changes since revision {previous}
                </Link>
              ) : null}
              <Link
                href={viewHref("all")}
                aria-current={view === "all" ? "page" : undefined}
                className={viewTab}
              >
                All files
              </Link>
            </nav>
          </div>
          {view === "base" && proposal ? (
            <ProposalChanges proposal={proposal} selected={fileParam} />
          ) : view === "changes" ? (
            <ReviewChanges
              changes={review.changes}
              selected={fileParam}
              emptyText={`No changes since revision ${previous}.`}
            />
          ) : (
            <ReviewAllFiles
              files={files}
              selected={selectedFile(files, fileParam, null)}
              line={Number.isInteger(lineParam) && lineParam > 0 ? lineParam : undefined}
            />
          )}
        </section>
      ) : null}

      <section
        aria-labelledby="checks"
        className="grid gap-2 rounded-panel border border-hairline bg-surface p-4"
      >
        <h2 id="checks" className="text-sm font-semibold text-fg">
          Checks on revision {current?.number ?? "–"}
        </h2>
        <IssueList issues={review.issues} />
      </section>

      <Conversation
        id={submission.id}
        events={review.events}
        canComment={review.can.comment}
        versionsHref={versionsPath(submission)}
      />
    </div>
  );
};

export default Review;
