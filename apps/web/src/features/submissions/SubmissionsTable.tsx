import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { itemNameOf, type Submission } from "@/server/domains/submissions/models/submission";

/** `2026-09-27 14:05 UTC`: the same for every viewer, like the rest of the app. */
const when = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** My submissions (feature 012): your drafts and submissions, newest change first. */
export const SubmissionsTable = ({ submissions }: { submissions: Submission[] }) => {
  if (submissions.length === 0)
    return (
      <Panel padding="lg" className="grid justify-items-start gap-3">
        <p className="text-sm text-fg">You have no drafts yet.</p>
        <p className="text-sm text-muted">
          A draft is a new item you're writing. Only you can see it until you submit it for review.
        </p>
        <Link href="/submissions/new" className={buttonClasses("primary")}>
          New item
        </Link>
      </Panel>
    );
  return (
    <Table>
      <thead>
        <tr>
          <Th>Item</Th>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th>Last change</Th>
        </tr>
      </thead>
      <tbody>
        {submissions.map((submission) => (
          <tr key={submission.id}>
            <Td>
              <Link
                href={`/submissions/${submission.id}`}
                className="font-mono text-sm text-link hover:underline"
              >
                {itemNameOf(submission)}
              </Link>
            </Td>
            <Td>
              <Badge>{submission.type}</Badge>
            </Td>
            <Td>
              <Badge tone={submission.status === "draft" ? "muted" : "accent"}>
                {submission.status}
              </Badge>
            </Td>
            <Td className="whitespace-nowrap font-mono text-xs text-muted">
              <time dateTime={submission.updatedAt.toISOString()}>
                {when(submission.updatedAt)}
              </time>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};
