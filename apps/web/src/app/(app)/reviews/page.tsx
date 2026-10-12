import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { parseListQuery } from "@/components/ui/data-table/list-query";
import { PageHeader } from "@/components/ui/Panel";
import { hereOf } from "@/features/current-workspace/current-workspace";
import { Showing } from "@/features/current-workspace/Showing";
import { BulkReleaseProvider, BulkReleaseToolbar } from "@/features/releases/BulkRelease";
import { BulkApproveProvider, BulkApproveToolbar } from "@/features/reviews/BulkApprove";
import { checkedQueueState, queueList, queueQueryOf } from "@/features/reviews/list";
import { QueueStatusProvider } from "@/features/reviews/QueueStatus";
import { approvableRows, QueueTable, QueueTabs, queueTab } from "@/features/reviews/QueueTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { canInSomeShared } from "@/server/domains/identity/models/permissions";
import { listQueue } from "@/server/domains/submissions/actions/reviews";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { workspaceView } from "../shell";

export const metadata = { title: "Reviews · Ronne AI Marketplace" };

/** The review queue (feature 014): moderators and root only; anyone else gets a 404. */
const Reviews = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const request = await requestHeaders();
  const user = await getCurrentUser(request);
  // Their own personal workspace (114) isn't reviewed: it makes nobody a reviewer.
  if (!canInSomeShared(user, "submissions.review")) notFound();
  const params = await searchParams;
  // The current workspace's (120): only its submissions, and every link keeps it.
  const view = await workspaceView("/reviews", params);
  const tab = queueTab(params.tab);
  const list = queueList(tab, view.fixed);
  const state = checkedQueueState(parseListQuery(list, params));
  const { rows, next, previous, total, workspaces } = await listQueue(
    request,
    queueQueryOf(tab, state, view.workspace),
  );
  const table = (actions?: ReactNode) => (
    <QueueTable
      tab={tab}
      list={list}
      state={state}
      rows={rows}
      page={{ next, previous }}
      total={total}
      actions={actions}
    />
  );
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What authors have sent for review. Review is the gate: nothing is installable until it's approved and released."
      />
      {view.workspace ? (
        <Showing
          workspace={view.workspace}
          here={hereOf("/reviews", params)}
          why={workspaces.some((w) => w.name === view.workspace) ? undefined : "not-reviewer"}
        />
      ) : null}
      <QueueTabs tab={tab} keep={view.fixed} />
      {tab === "needs" || tab === "release" ? <Help id="queue-decisions" /> : null}
      <QueueStatusProvider>
        {tab === "release" ? (
          <BulkReleaseProvider
            releasable={Object.fromEntries(rows.map((row) => [row.id, itemNameOf(row)]))}
          >
            {table(
              <BulkReleaseToolbar selectAllLabel="Select all" help={<Help id="release-many" />} />,
            )}
          </BulkReleaseProvider>
        ) : tab === "needs" ? (
          <BulkApproveProvider approvable={approvableRows(rows)}>
            {table(<BulkApproveToolbar help={<Help id="approve-many" />} />)}
          </BulkApproveProvider>
        ) : (
          table()
        )}
      </QueueStatusProvider>
    </>
  );
};

export default Reviews;
