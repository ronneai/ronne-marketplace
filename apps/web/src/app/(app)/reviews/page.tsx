import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/Panel";
import { BulkApproveProvider, BulkApproveToolbar } from "@/features/reviews/BulkApprove";
import { approvableRows, QueueTable, QueueTabs, queueTab } from "@/features/reviews/QueueTable";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { listQueue } from "@/server/domains/submissions/actions/reviews";
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
  const { rows, nextCursor } = await listQueue(request, { tab, cursor });
  return (
    <>
      <PageHeader
        title="Reviews"
        description="What authors have sent for review. Review is the gate: nothing is installable until it's approved and released."
      />
      <QueueTabs tab={tab} />
      {tab === "needs" ? (
        <BulkApproveProvider approvable={approvableRows(rows)}>
          <BulkApproveToolbar />
          <QueueTable tab={tab} rows={rows} nextCursor={nextCursor} />
        </BulkApproveProvider>
      ) : (
        <QueueTable tab={tab} rows={rows} nextCursor={nextCursor} />
      )}
    </>
  );
};

export default Reviews;
