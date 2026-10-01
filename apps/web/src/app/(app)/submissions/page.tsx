import Link from "next/link";
import { Help } from "@/components/help/Help";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Panel";
import { BulkSubmitProvider, BulkToolbar } from "@/features/submissions/BulkSubmit";
import {
  inListOrder,
  StatusFilters,
  SubmissionsTable,
  statusFilter,
} from "@/features/submissions/SubmissionsTable";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { checkManyDrafts } from "@/server/domains/submissions/actions/submissions";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "My submissions · Ronne AI Marketplace" };

/**
 * Every signed-in user sees their own drafts and submissions (012), filtered by status (013), and
 * can submit several ready drafts at once (052).
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
  const errors: Record<string, number> = {};
  const ready: Record<string, string> = {};
  for (const draft of checked) {
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
      <BulkSubmitProvider ready={ready}>
        <StatusFilters submissions={submissions} status={status} />
        <BulkToolbar />
        <SubmissionsTable
          submissions={status ? submissions.filter((s) => s.status === status) : submissions}
          errors={checked.length > 0 ? errors : undefined}
        />
      </BulkSubmitProvider>
    </>
  );
};

export default Submissions;
