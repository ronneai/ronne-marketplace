import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Help } from "@/components/help/Help";
import { buttonClasses } from "@/components/ui/Button";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { hereOf } from "@/features/current-workspace/current-workspace";
import { Showing } from "@/features/current-workspace/Showing";
import { BulkReleaseProvider, BulkReleaseToolbar } from "@/features/releases/BulkRelease";
import { BulkSubmitProvider, BulkToolbar } from "@/features/submissions/BulkSubmit";
import {
  checkedSubmissionsState,
  submissionsList,
  submissionsQueryOf,
} from "@/features/submissions/list";
import {
  NoSubmissions,
  StatusFilters,
  SubmissionsTable,
} from "@/features/submissions/SubmissionsTable";
import { pageTitle } from "@/i18n/page-title";
import {
  countMySubmissionsByStatus,
  pageMySubmissions,
} from "@/server/domains/submissions/actions/drafts";
import {
  canDeleteSubmission,
  checkManyDrafts,
  dependencyMarks,
  latestFeedback,
} from "@/server/domains/submissions/actions/submissions";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../hold";
import { workspaceView } from "../shell";

export const generateMetadata = async () => {
  const t = await getTranslations("author.submissions");
  return { title: pageTitle(t("pageTitle")) };
};

/**
 * Every signed-in user sees their own drafts and submissions (012), filtered by status (013), and
 * can submit several ready drafts at once (052). Archived ones have their own filter (057). Since
 * 063 a page at a time from the server, with the status counts from one query. The current
 * workspace (120) narrows the list and the counts to its submissions.
 */
const Submissions = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  await holdPage();
  const t = await getTranslations("author.submissions");
  const params = await searchParams;
  const view = await workspaceView("/submissions", params);
  const list = submissionsList(view.fixed);
  const state = checkedSubmissionsState(parseListQuery(list, params));
  const headers = await requestHeaders();
  const [{ rows, next, previous, total }, counts, { drafts: checked }] = await Promise.all([
    pageMySubmissions(headers, submissionsQueryOf(state, view.workspace)),
    countMySubmissionsByStatus(headers, view.workspace ?? undefined),
    // Which open drafts Submit would take now (052): one check for the newest 100 of them, across
    // the whole list, so Select all ready isn't limited to this page.
    checkManyDrafts(headers, { all: true }),
  ]);
  // In one workspace with nothing there, still the table (empty), not the first-time page.
  const hasAny = Object.values(counts).some((n) => (n ?? 0) > 0) || view.workspace !== null;
  // The page's approved ones, released many at once (055).
  const releasable = Object.fromEntries(
    rows.filter((s) => s.status === "approved").map((s) => [s.id, itemNameOf(s)]),
  );
  // Per page (063): what each waits on (056), the latest reviewer message (058), and, under the
  // Archived filter, which can be deleted for good (057).
  const [marks, feedback, deletable] = await Promise.all([
    dependencyMarks(headers, rows),
    latestFeedback(headers, rows),
    Promise.all(
      rows
        .filter((s) => s.status === "withdrawn")
        .map(async (s) => [s.id, await canDeleteSubmission(headers, s.id)] as const),
    ).then(Object.fromEntries),
  ]);
  const errors: Record<string, number> = {};
  const ready: Record<string, string> = {};
  // Each draft's own dependency drafts (056), selected with it.
  const needs: Record<string, readonly string[]> = {};
  for (const draft of checked) {
    if (draft.needs) needs[draft.id] = draft.needs;
    if (!("issues" in draft)) continue;
    errors[draft.id] = draft.issues.filter((issue) => issue.severity === "error").length;
    if (draft.result === "ready") ready[draft.id] = itemNameOf(draft.submission);
  }
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          hasAny ? (
            <Link href="/submissions/new" className={buttonClasses("primary")}>
              {t("newItem")}
            </Link>
          ) : null
        }
      />
      <Help id="export" />
      {view.workspace ? (
        <Showing workspace={view.workspace} here={hereOf("/submissions", params)} />
      ) : null}
      {hasAny ? (
        <BulkSubmitProvider ready={ready} needs={needs}>
          <BulkReleaseProvider releasable={releasable}>
            <StatusFilters counts={counts} state={state} list={list} />
            {state.filters.status === "withdrawn" ? <Help id="archived" /> : null}
            <SubmissionsTable
              list={list}
              state={state}
              submissions={rows}
              page={{ next, previous }}
              total={total}
              actions={
                <>
                  <BulkToolbar
                    help={
                      <>
                        <Help id="submit-many" />
                        <Help id="ready" />
                      </>
                    }
                  />
                  <BulkReleaseToolbar help={<Help id="release-many" />} />
                </>
              }
              errors={checked.length > 0 ? errors : undefined}
              marks={marks}
              releasable={releasable}
              deletable={deletable}
              feedback={feedback}
            />
          </BulkReleaseProvider>
        </BulkSubmitProvider>
      ) : (
        <NoSubmissions />
      )}
    </>
  );
};

export default Submissions;
