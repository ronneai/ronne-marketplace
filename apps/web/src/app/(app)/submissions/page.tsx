import Link from "next/link";
import { Help } from "@/components/help/Help";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Panel";
import {
  inListOrder,
  StatusFilters,
  SubmissionsTable,
  statusFilter,
} from "@/features/submissions/SubmissionsTable";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "My submissions · Ronne AI Marketplace" };

/** Every signed-in user sees their own drafts and submissions (012), filtered by status (013). */
const Submissions = async ({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  const status = statusFilter((await searchParams).status);
  const submissions = inListOrder(await listMySubmissions(await requestHeaders()));
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
      <StatusFilters submissions={submissions} status={status} />
      <SubmissionsTable
        submissions={status ? submissions.filter((s) => s.status === status) : submissions}
      />
    </>
  );
};

export default Submissions;
