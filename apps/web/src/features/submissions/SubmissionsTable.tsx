import Link from "next/link";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { utcMinute } from "@/components/ui/time";
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  statusLabel,
} from "@/server/domains/submissions/models/status";
import { itemNameOf, type Submission } from "@/server/domains/submissions/models/submission";

/** `?status=`, when it's a status; otherwise every status. */
export const statusFilter = (value: string | string[] | undefined): SubmissionStatus | null => {
  const status = Array.isArray(value) ? value[0] : value;
  return status && (SUBMISSION_STATUSES as readonly string[]).includes(status)
    ? (status as SubmissionStatus)
    : null;
};

/** Newest change first, with withdrawn ones last (spec 013): they're only kept for history. */
export const inListOrder = (submissions: readonly Submission[]): Submission[] =>
  [...submissions].sort(
    (a, b) =>
      Number(a.status === "withdrawn") - Number(b.status === "withdrawn") ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

const chipClasses =
  "rounded-full border border-hairline px-3 py-1 font-mono text-xs text-muted hover:text-fg aria-[current=page]:border-transparent aria-[current=page]:bg-fg aria-[current=page]:text-canvas outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** Status filters (feature 013): All, then each status you have, with its count. */
export const StatusFilters = ({
  submissions,
  status,
}: {
  submissions: readonly Submission[];
  status: SubmissionStatus | null;
}) => {
  const counts = new Map<SubmissionStatus, number>();
  for (const submission of submissions)
    counts.set(submission.status, (counts.get(submission.status) ?? 0) + 1);
  const shown = SUBMISSION_STATUSES.filter((s) => counts.has(s));
  if (shown.length < 2 && status === null) return null;
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2 pb-4">
      <Link
        href="/submissions"
        aria-current={status === null ? "page" : undefined}
        className={chipClasses}
      >
        All ({submissions.length})
      </Link>
      {shown.map((s) => (
        <Link
          key={s}
          href={`/submissions?status=${s}`}
          aria-current={status === s ? "page" : undefined}
          className={chipClasses}
        >
          {statusLabel(s)} ({counts.get(s)})
        </Link>
      ))}
    </nav>
  );
};

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
              <StatusBadge status={submission.status} />
            </Td>
            <Td className="whitespace-nowrap font-mono text-xs text-muted">
              <time dateTime={submission.updatedAt.toISOString()}>
                {utcMinute(submission.updatedAt)}
              </time>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};
