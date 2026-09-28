import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Panel";
import { SubmissionsTable } from "@/features/submissions/SubmissionsTable";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "My submissions · Ronne" };

/** Every signed-in user sees their own drafts and submissions (feature 012). */
const Submissions = async () => {
  const submissions = await listMySubmissions(await requestHeaders());
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
      <SubmissionsTable submissions={submissions} />
    </>
  );
};

export default Submissions;
