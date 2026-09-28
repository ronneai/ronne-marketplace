import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { utcMinute } from "@/components/ui/time";
import { IssueList } from "@/components/validation/IssueList";
import { Conversation } from "@/features/reviews/Conversation";
import { DecisionBar } from "@/features/reviews/DecisionBar";
import { AllFiles, FileChanges } from "@/features/reviews/FileViews";
import { RiskSummary } from "@/features/reviews/RiskSummary";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import {
  getReview,
  type ReviewDecision,
  type ReviewView,
} from "@/server/domains/submissions/actions/reviews";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Review · Ronne" };

const viewTab =
  "rounded-control px-3 py-1.5 text-sm text-muted hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg";

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
  if (!can(await getCurrentUser(request), "submissions.review")) notFound();
  const { id } = await params;
  let review: ReviewView;
  try {
    review = await getReview(request, id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  const { submission, current, previous } = review;
  // Changes since the last revision by default from revision 2 on; revision 1 is all files.
  const view = (await searchParams).view === "all" || previous === null ? "all" : "changes";
  const base = `/reviews/${submission.id}`;
  const decisions: ReviewDecision[] = [
    ...(review.can.decide ? (["approve", "request_changes", "reject"] as const) : []),
    ...(review.can.override ? (["override"] as const) : []),
  ];

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
            <Badge>{submission.type}</Badge>
            <StatusBadge status={submission.status} />
            <span>
              by <span className="text-fg">{submission.authorName}</span>
              {review.mine ? " (you)" : ""}
            </span>
            {current ? <span className="font-mono text-xs">revision {current.number}</span> : null}
            {submission.submittedAt ? (
              <span className="font-mono text-xs">
                submitted {utcMinute(submission.submittedAt)}
              </span>
            ) : null}
          </p>
        </div>
        <DecisionBar id={submission.id} decisions={decisions} />
      </header>
      {review.mine && !review.can.override ? (
        <p className="text-sm text-muted">
          This is your own submission: another moderator or root reviews it.
        </p>
      ) : null}

      <RiskSummary flags={review.flags} base={base} />

      {current ? (
        <section aria-labelledby="files" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="files" className="text-lg font-semibold text-fg">
              Files
            </h2>
            <nav aria-label="Files view" className="flex gap-1">
              {previous !== null ? (
                <Link
                  href={base}
                  aria-current={view === "changes" ? "page" : undefined}
                  className={viewTab}
                >
                  Changes since revision {previous}
                </Link>
              ) : null}
              <Link
                href={`${base}?view=all`}
                aria-current={view === "all" ? "page" : undefined}
                className={viewTab}
              >
                All files
              </Link>
            </nav>
          </div>
          {view === "changes" ? (
            <FileChanges changes={review.changes} since={previous} />
          ) : (
            <AllFiles files={current.files} />
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

      <Conversation id={submission.id} events={review.events} canComment={review.can.comment} />
    </div>
  );
};

export default Review;
