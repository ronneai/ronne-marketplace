import { History } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { selectedFile, showFiles } from "@/components/files/shown";
import { Help } from "@/components/help/Help";
import { RiskSummary } from "@/components/risk-flags/RiskSummary";
import { ScanCard } from "@/components/scan/ScanCard";
import { DependencyMarksNotice } from "@/components/submissions/DependencyMarks";
import { ProposalBadges } from "@/components/submissions/ProposalBadges";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { TabLinks } from "@/components/ui/TabLinks";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { IssueList } from "@/components/validation/IssueList";
import { WithdrawButton } from "@/features/draft-editor/SubmitDialogs";
import { versionsPath } from "@/features/versions/links";
import { reviewScan } from "@/server/domains/scans/actions/scans";
import type { ReviewView } from "@/server/domains/submissions/actions/reviews";
import { dependencyMarks } from "@/server/domains/submissions/actions/submissions";
import { isUnreleased } from "@/server/domains/submissions/models/diff";
import type { RevisionFile } from "@/server/domains/submissions/models/review";
import { canTransition, OPEN_STATUSES } from "@/server/domains/submissions/models/status";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { Conversation } from "./Conversation";
import { DecisionBar } from "./DecisionBar";
import { ProposalChanges } from "./ProposalChanges";
import { PublishDialog } from "./PublishDialog";
import { ReviewAllFiles, ReviewChanges } from "./ReviewFiles";
import { ReviewScanFindings } from "./ReviewScanFindings";
import { releaseGroupFor } from "./release-group";
import { ScanOverride } from "./ScanOverride";
import { ScanRequest } from "./ScanRequest";

/** The review page's tabs (137), as on a pull request. */
const TABS = ["overview", "files", "conversation", "scan"] as const;
type Tab = (typeof TABS)[number];

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
 * A submission's screen (137), the same for whoever reviews it and for its author: the header, the
 * tabs (Overview, Files, Conversation, Security scan) and what each shows. Only the actions differ:
 * on the review page (`route: "review"`) the decisions; on the author's page (`"author"`) what the
 * author may do, passed in as `actions` and `notices`, and a decision only where one is allowed.
 * The files, the risk summary and the checks come from the latest revision, so this is exactly
 * what was submitted.
 */
export const SubmissionScreen = async ({
  review,
  query,
  route,
  actions,
  notices,
}: {
  review: ReviewView;
  query: Record<string, string | string[] | undefined>;
  route: "review" | "author";
  /** The author's own buttons, in the header beside Withdraw. */
  actions?: ReactNode;
  /** The author's notices (why it was sent back, archived, a proposal's rebase), under the header. */
  notices?: ReactNode;
}) => {
  const t = await getTranslations("author.review");
  const crumbs = await getTranslations("item.breadcrumb");
  const mineWords = await getTranslations("author.submissions");
  const request = await requestHeaders();
  const id = review.submission.id;
  const { submission, current, previous, proposal } = review;
  // What it waits on (056): reviewers see it before approving.
  const marks = (await dependencyMarks(request, [submission]))[submission.id];
  // What goes out with it, or why it can't go yet (112).
  const release = review.can.publish ? await releaseGroupFor(request, id) : null;
  // A proposal (017) opens on its changes to its base version. Otherwise, changes since the last
  // revision by default from revision 2 on; revision 1 is all files.
  const defaultView = proposal ? "base" : previous === null ? "all" : "changes";
  const asked = query.view;
  // The file shown, and the line a risk flag's link opens it at (058).
  const fileParam = typeof query.file === "string" ? query.file : undefined;
  const lineParam = typeof query.line === "string" ? Number.parseInt(query.line, 10) : Number.NaN;
  const view =
    asked === "all" || (asked === "changes" && previous !== null) || (asked === "base" && proposal)
      ? asked
      : defaultView;
  const base = `${route === "review" ? "/reviews" : "/submissions"}/${submission.id}`;
  // The tabs (137): Overview by default; a link that opens a file or a view (a risk flag's, a
  // finding's) opens Files.
  const tab =
    typeof query.tab === "string" && (TABS as readonly string[]).includes(query.tab)
      ? (query.tab as Tab)
      : asked !== undefined || fileParam !== undefined
        ? "files"
        : "overview";
  // The Security scan of the revision shown (135); the review itself already checked access.
  const latestRevisionId = review.revisions.at(-1)?.id ?? null;
  const scanView = await reviewScan(request, latestRevisionId);
  const viewHref = (v: string) =>
    v === defaultView ? `${base}?tab=files` : `${base}?tab=files&view=${v}`;
  const tabHref = (id: Tab) => (id === "overview" ? base : `${base}?tab=${id}`);
  const scan = scanView.scan;
  const findings = scan?.status === "done" ? (scan.result?.findings.length ?? 0) : null;
  // What's released: `.ronne/` (the canvas layout) is the editor's, not the reviewer's (058).
  const files = current
    ? showFiles(current.files.filter((f) => !isUnreleased(f.path)).map(toContent))
    : [];
  // Every decision a reviewer may make here, disabled with the reason when it isn't theirs (058).
  // Root's scan override is the card's Override (137), not one of these buttons.
  const decisions = review.decisions.filter((d) => d.decision !== "scan_override");
  const scanOverride = review.decisions.some((d) => d.decision === "scan_override" && d.allowed);
  // A reviewer sees every decision, off with the reason when it isn't theirs; the author's page
  // only those someone may make (root on their own, say), never a row of disabled buttons.
  // The author's page of their own: the way back is My submissions, and the notices are theirs.
  const ownPage = route === "author" && review.mine;
  // Out of date only while it's open: a released or closed proposal has nothing to rebase.
  const stale =
    submission.status === "draft" || OPEN_STATUSES.includes(submission.status)
      ? (proposal?.stale ?? null)
      : null;
  const shown = route === "review" ? decisions : decisions.filter((d) => d.allowed);
  const showDecisions = shown.length > 0;
  // On the Overview, nothing when there's nothing to say; on the Security scan tab, always.
  const scanCard = (always = false) => (
    <ScanCard
      always={always}
      view={scanView}
      gate={review.gate}
      item={itemNameOf(submission)}
      revision={current?.number ?? null}
      submissionId={submission.id}
      base={base}
      inspectHref={tabHref("scan")}
      author={route === "author" && review.mine}
      request={
        scanView.canRequest && latestRevisionId ? (
          <ScanRequest
            key="scan-request"
            revisionId={latestRevisionId}
            submissionId={submission.id}
            again={scan !== null}
          />
        ) : null
      }
      override={
        scanOverride ? (
          <ScanOverride
            key="scan-override"
            id={submission.id}
            name={itemNameOf(submission)}
            revision={current?.number ?? null}
          />
        ) : null
      }
    />
  );

  return (
    <div className="grid gap-6">
      <nav aria-label={crumbs("label")} className="text-xs text-muted">
        <Link
          href={ownPage ? "/submissions" : "/reviews"}
          className="hover:text-fg hover:underline"
        >
          {ownPage ? mineWords("title") : t("breadcrumb")}
        </Link>{" "}
        / <span className="text-fg">{itemNameOf(submission)}</span>
      </nav>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1.5">
          <h1 className="font-mono text-xl font-semibold text-fg">{itemNameOf(submission)}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <TypeBadge type={submission.type} />
            <StatusBadge status={submission.status} />
            <ProposalBadges proposal={submission.proposal} stale={stale} />
            <span>
              {t.rich(review.mine ? "byYou" : "by", {
                name: submission.authorName,
                author: (chunks) => <span className="text-fg">{chunks}</span>,
              })}
            </span>
            {current ? (
              <span className="tabular-nums text-xs">
                {t("revision", { number: current.number })}
              </span>
            ) : null}
            {submission.submittedAt ? (
              <span className="text-xs">
                {t.rich("submitted", {
                  date: () =>
                    submission.submittedAt ? <LocalTime value={submission.submittedAt} /> : null,
                })}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review.published.length > 0 ? (
            <Link href={versionsPath(submission)} className={buttonClasses("secondary")}>
              <History size={16} aria-hidden="true" />
              {t("viewVersions")}
            </Link>
          ) : null}
          {/* The author can pull it back from here too, until it's released (058). */}
          {review.mine && canTransition(submission.status, "withdraw") ? (
            <WithdrawButton draftId={submission.id} itemName={itemNameOf(submission)} />
          ) : null}
          {actions}
          {/* What the buttons do, beside them (owner, 2026-10-28). */}
          {showDecisions ? <Help id="decisions" /> : null}
          {showDecisions ? (
            <DecisionBar
              id={submission.id}
              name={itemNameOf(submission)}
              decisions={shown}
              dependents={review.dependents}
              revision={current?.number ?? null}
            />
          ) : null}
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
      {notices}
      {route === "review" && review.mine && submission.status === "submitted" ? (
        <p className="text-sm text-muted">
          {t(review.can.override ? "ownOverride" : "ownSubmission")}
        </p>
      ) : null}

      {/* It says why Approve is off: seen whichever tab is open. */}
      {/* On their own page the author's proposal bar says it, with its Rebase. */}
      {!ownPage && stale ? (
        <Notice kind="warn" title={t("staleTitle", { stale })}>
          {/* Approved already: it's the release that waits on the rebase. */}
          {t(submission.status === "approved" ? "staleApproved" : "stale", {
            version: proposal?.baseVersion ?? "",
            stale,
          })}
        </Notice>
      ) : null}

      <TabLinks
        label={t("tabs.label")}
        current={tab}
        tabs={[
          { id: "overview", label: t("tabs.overview"), href: tabHref("overview") },
          {
            id: "files",
            // What the tab shows: .ronne/ isn't released, so it isn't counted (058).
            label: t("tabs.files", { count: files.length }),
            href: tabHref("files"),
          },
          {
            id: "conversation",
            label: t("tabs.conversation", { count: review.events.length }),
            href: tabHref("conversation"),
          },
          {
            id: "scan",
            label: findings === null ? t("tabs.scan") : t("tabs.scanCount", { count: findings }),
            href: tabHref("scan"),
          },
        ]}
      />

      {tab === "overview" ? (
        <>
          <DependencyMarksNotice marks={marks} />

          <RiskSummary flags={review.flags} base={base} />

          {scanCard()}

          <section
            aria-labelledby="checks"
            className="grid gap-2 rounded-panel border border-hairline bg-surface p-4"
          >
            <h2 id="checks" className="text-sm font-semibold text-fg">
              {t("checks", { number: current?.number ?? t("noRevision") })}
            </h2>
            <IssueList issues={review.issues} />
          </section>
        </>
      ) : null}

      {tab === "files" ? (
        current ? (
          <section aria-labelledby="files" className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="files" className="text-lg font-semibold text-fg">
                {t("files")}
              </h2>
              <nav aria-label={t("filesView")} className="flex flex-wrap gap-1">
                {proposal ? (
                  <Link
                    href={viewHref("base")}
                    aria-current={view === "base" ? "page" : undefined}
                    className={viewTab}
                  >
                    {t("changesTo", { version: proposal.baseVersion })}
                  </Link>
                ) : null}
                {previous !== null ? (
                  <Link
                    href={viewHref("changes")}
                    aria-current={view === "changes" ? "page" : undefined}
                    className={viewTab}
                  >
                    {t("changesSince", { number: previous })}
                  </Link>
                ) : null}
                <Link
                  href={viewHref("all")}
                  aria-current={view === "all" ? "page" : undefined}
                  className={viewTab}
                >
                  {t("allFiles")}
                </Link>
              </nav>
            </div>
            {view === "base" && proposal ? (
              <ProposalChanges proposal={proposal} selected={fileParam} />
            ) : view === "changes" ? (
              <ReviewChanges
                changes={review.changes}
                selected={fileParam}
                emptyText={t("noChangesSince", { number: previous ?? 0 })}
              />
            ) : (
              <ReviewAllFiles
                files={files}
                selected={selectedFile(files, fileParam, null)}
                line={Number.isInteger(lineParam) && lineParam > 0 ? lineParam : undefined}
              />
            )}
          </section>
        ) : null
      ) : null}

      {tab === "conversation" ? (
        <Conversation
          id={submission.id}
          events={review.events}
          canComment={review.can.comment}
          versionsHref={versionsPath(submission)}
        />
      ) : null}

      {tab === "scan" ? (
        scan?.status === "done" && scan.result && scan.result.findings.length > 0 ? (
          <ReviewScanFindings
            item={itemNameOf(submission)}
            revision={current?.number ?? null}
            scan={{ id: scan.id, finishedAt: scan.finishedAt, llm: scan.llm }}
            result={scan.result}
            dismissals={scanView.dismissals}
            canDismiss={scanView.canDismiss}
            submissionId={submission.id}
            base={base}
            name={itemNameOf(submission)}
            canAskFix={review.decisions.some((d) => d.decision === "request_changes" && d.allowed)}
          />
        ) : (
          scanCard(true)
        )
      ) : null}
    </div>
  );
};
