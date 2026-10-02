import Link from "next/link";
import { Help } from "@/components/help/Help";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Panel";
import { BulkReleaseProvider, BulkReleaseToolbar } from "@/features/releases/BulkRelease";
import { BulkSubmitProvider, BulkToolbar } from "@/features/submissions/BulkSubmit";
import {
  inListOrder,
  StatusFilters,
  SubmissionsTable,
  shownFor,
  statusFilter,
} from "@/features/submissions/SubmissionsTable";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import {
  canDeleteSubmission,
  checkManyDrafts,
  dependencyMarks,
} from "@/server/domains/submissions/actions/submissions";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "My submissions · Ronne AI Marketplace" };

/**
 * Every signed-in user sees their own drafts and submissions (012), filtered by status (013), and
 * can submit several ready drafts at once (052). Archived ones have their own filter (057).
 */
const Submissions = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const status = statusFilter((await searchParams).status);
  const headers = await requestHeaders();
  const submissions = inListOrder(await listMySubmissions(headers));
  // Which open drafts Submit would take now (052): one check for the newest 100 of them.
  const { drafts: checked } = await checkManyDrafts(headers, { all: true });
  // Approved ones, released many at once (055).
  const releasable = Object.fromEntries(
    submissions
      .filter((s) => s.status === "approved")
      .map((s) => [s.id, `@${s.scope.name}/${s.name}`]),
  );
  // What each waits on (056): dependencies in review, not submitted, or blocked.
  const marks = await dependencyMarks(headers, submissions);
  const shown = shownFor(submissions, status);
  // Under the Archived filter (057): which can be deleted for good.
  const deletable = Object.fromEntries(
    await Promise.all(
      shown
        .filter((s) => s.status === "withdrawn")
        .map(async (s) => [s.id, await canDeleteSubmission(headers, s.id)] as const),
    ),
  );
  const errors: Record<string, number> = {};
  const ready: Record<string, string> = {};
  // Each draft's own dependency drafts (056), selected with it.
  const needs: Record<string, readonly string[]> = {};
  for (const draft of checked) {
    if (draft.needs) needs[draft.id] = draft.needs;
    if (!("issues" in draft)) continue;
    errors[draft.id] = draft.issues.filter((issue) => issue.severity === "error").length;
    if (draft.result === "ready")
      ready[draft.id] = `@${draft.submission.scope.name}/${draft.submission.name}`;
  }
  return (
    <>
      <PageHeader
        title="My submissions"
        description="Your drafts and submissions. A draft is private until you submit it for review."
        actions={
          submissions.length > 0 ? (
            <Link href="/submissions/new" className={buttonClasses("primary")}>
              New item
            </Link>
          ) : null
        }
      />
      <Help id="export" />
      <BulkSubmitProvider ready={ready} needs={needs}>
        <BulkReleaseProvider releasable={releasable}>
          <StatusFilters submissions={submissions} status={status} />
          {status === "withdrawn" ? <Help id="archived" /> : null}
          <BulkToolbar
            help={
              <>
                <Help id="submit-many" />
                <Help id="ready" />
              </>
            }
          />
          <BulkReleaseToolbar help={<Help id="release-many" />} />
          <SubmissionsTable
            submissions={shown}
            errors={checked.length > 0 ? errors : undefined}
            marks={marks}
            releasable={releasable}
            deletable={deletable}
          />
        </BulkReleaseProvider>
      </BulkSubmitProvider>
    </>
  );
};

export default Submissions;
