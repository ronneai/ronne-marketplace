import { notFound } from "next/navigation";
import { Help } from "@/components/help/Help";
import { PageHeader } from "@/components/ui/Panel";
import { BulkReleaseProvider, BulkReleaseToolbar } from "@/features/releases/BulkRelease";
import { BulkApproveProvider, BulkApproveToolbar } from "@/features/reviews/BulkApprove";
import { QueueStatusProvider } from "@/features/reviews/QueueStatus";
import { approvableRows, QueueTable, QueueTabs, queueTab } from "@/features/reviews/QueueTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { listQueue } from "@/server/domains/submissions/actions/reviews";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Reviews · Ronne AI Marketplace" };

/** The review queue (feature 014): moderators and root only; anyone else gets a 404. */
const Reviews = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "submissions.review")) notFound();
  const params = await searchParams;
  const tab = queueTab(params.tab);
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const { rows, next: nextCursor } = await listQueue(request, { tab, cursor });
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What authors have sent for review. Review is the gate: nothing is installable until it's approved and released."
      />
      <QueueTabs tab={tab} />
      {tab === "needs" || tab === "release" ? <Help id="queue-decisions" /> : null}
      <QueueStatusProvider>
        {tab === "release" ? (
          <BulkReleaseProvider
            releasable={Object.fromEntries(rows.map((row) => [row.id, itemNameOf(row)]))}
          >
            <BulkReleaseToolbar selectAllLabel="Select all" help={<Help id="release-many" />} />
            <QueueTable tab={tab} rows={rows} nextCursor={nextCursor} />
          </BulkReleaseProvider>
        ) : tab === "needs" ? (
          <BulkApproveProvider approvable={approvableRows(rows)}>
            <BulkApproveToolbar help={<Help id="approve-many" />} />
            <QueueTable tab={tab} rows={rows} nextCursor={nextCursor} />
          </BulkApproveProvider>
        ) : (
          <QueueTable tab={tab} rows={rows} nextCursor={nextCursor} />
        )}
      </QueueStatusProvider>
    </>
  );
};

export default Reviews;
