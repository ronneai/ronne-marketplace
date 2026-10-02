import Link from "next/link";
import { DependencyMarksIcon } from "@/components/submissions/DependencyMarks";
import { ProposalBadges } from "@/components/submissions/ProposalBadges";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { TypeBadge } from "@/components/ui/TypeBadge";
import type { DependencyMark, RowFeedback } from "@/server/domains/submissions/actions/submissions";
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  statusLabel,
} from "@/server/domains/submissions/models/status";
import { itemNameOf, type Submission } from "@/server/domains/submissions/models/submission";
import { ReleaseSelectCell } from "../releases/BulkRelease";
import { ArchivedActions } from "./ArchivedActions";
import { ReadinessMark, SelectCell } from "./BulkSubmit";

/** `?status=`, when it's a status; otherwise every status. */
export const statusFilter = (value: string | string[] | undefined): SubmissionStatus | null => {
  const status = Array.isArray(value) ? value[0] : value;
  return status && (SUBMISSION_STATUSES as readonly string[]).includes(status)
    ? (status as SubmissionStatus)
    : null;
};

/** Newest change first. */
export const inListOrder = <S extends Submission>(submissions: readonly S[]): S[] =>
  [...submissions].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

/**
 * The rows a filter shows: one status, or, for All, every status but archived (057). Archived ones
 * are out of the way until the Archived filter asks for them.
 */
export const shownFor = <S extends Submission>(
  submissions: readonly S[],
  status: SubmissionStatus | null,
): S[] => submissions.filter((s) => (status ? s.status === status : s.status !== "withdrawn"));

/** The filters' order: archived last, after everything still in play. */
const FILTER_ORDER: readonly SubmissionStatus[] = [
  ...SUBMISSION_STATUSES.filter((s) => s !== "withdrawn"),
  "withdrawn",
];

const chipClasses =
  "rounded-full border border-hairline px-3 py-1 font-mono text-xs text-muted hover:text-fg aria-[current=page]:border-transparent aria-[current=page]:bg-fg aria-[current=page]:text-canvas outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * Status filters (feature 013): All, then each status you have, with its count; Archived last, and
 * not counted in All (057).
 */
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
  const shown = FILTER_ORDER.filter((s) => counts.has(s));
  if (shown.length < 2 && status === null && !counts.has("withdrawn")) return null;
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2 pb-4">
      <Link
        href="/submissions"
        aria-current={status === null ? "page" : undefined}
        className={chipClasses}
      >
        All ({submissions.length - (counts.get("withdrawn") ?? 0)})
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

/** How long a reviewer's message may be on its row before it's shortened (058). */
const FEEDBACK_LENGTH = 120;

/** Shortened to one line, at a word where it can be. */
export const shortened = (text: string, length = FEEDBACK_LENGTH): string => {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= length) return line;
  const cut = line.slice(0, length);
  const space = cut.lastIndexOf(" ");
  return `${(space > length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

/** Under a row sent back or rejected (058): who, and their message, in full on hover. */
const FeedbackLine = ({ feedback }: { feedback?: RowFeedback }) =>
  feedback ? (
    <p className="mt-1 max-w-prose text-xs text-muted" title={feedback.body ?? undefined}>
      <span className="font-semibold">
        {feedback.kind === "reject" ? "Rejected" : "Changes requested"} by {feedback.by}
        {feedback.body ? ": " : "."}
      </span>
      {feedback.body ? shortened(feedback.body) : null}
    </p>
  ) : null;

/** My submissions (feature 012): your drafts and submissions, newest change first. */
export const SubmissionsTable = ({
  submissions,
  errors,
  marks,
  releasable,
  deletable,
  feedback,
}: {
  /** With `stale` for change proposals (017) that a newer version overtook. */
  submissions: (Submission & { stale?: string | null })[];
  /**
   * For bulk submitting (052): each open draft's count of what Submit would refuse now, by id (0
   * when ready). Rows with a count get a checkbox and a Ready or n to fix mark; without it, none.
   */
  errors?: Readonly<Record<string, number>>;
  /** What each waits on (056), by id: dependencies in review, not submitted, or blocked. */
  marks?: Readonly<Record<string, readonly DependencyMark[]>>;
  /** Approved ones that can be released at once (055), by id: a checkbox each. */
  releasable?: Readonly<Record<string, string>>;
  /**
   * Under the Archived filter (057): whether each can be deleted for good, by id. Archived rows get
   * Restore, and Delete where allowed.
   */
  deletable?: Readonly<Record<string, boolean>>;
  /** The latest reviewer message on rows sent back or rejected (058), by id. */
  feedback?: Readonly<Record<string, RowFeedback>>;
}) => {
  const selecting = errors !== undefined || Object.keys(releasable ?? {}).length > 0;
  const archived = submissions.some((s) => s.status === "withdrawn");
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
          {selecting ? (
            <Th>
              <span className="sr-only">Select</span>
            </Th>
          ) : null}
          <Th>Item</Th>
          <Th>Type</Th>
          <Th>Status</Th>
          <Th>Last change</Th>
          {archived ? (
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {submissions.map((submission) => (
          <tr key={submission.id}>
            {selecting ? (
              <Td>
                {errors?.[submission.id] !== undefined ? (
                  <SelectCell
                    id={submission.id}
                    name={itemNameOf(submission)}
                    errors={errors[submission.id] ?? 0}
                  />
                ) : releasable?.[submission.id] ? (
                  <ReleaseSelectCell id={submission.id} name={itemNameOf(submission)} />
                ) : null}
              </Td>
            ) : null}
            <Td>
              <Link
                href={`/submissions/${submission.id}`}
                className="font-mono text-sm text-link hover:underline"
              >
                {itemNameOf(submission)}
              </Link>
              {submission.proposal ? (
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  <ProposalBadges proposal={submission.proposal} stale={submission.stale} />
                </span>
              ) : null}
              <FeedbackLine feedback={feedback?.[submission.id]} />
            </Td>
            <Td>
              <TypeBadge type={submission.type} />
            </Td>
            <Td>
              <StatusBadge status={submission.status} />
              {errors?.[submission.id] !== undefined ? (
                <ReadinessMark id={submission.id} errors={errors[submission.id] ?? 0} />
              ) : null}
              <DependencyMarksIcon marks={marks?.[submission.id]} className="ml-2 align-middle" />
            </Td>
            <Td className="whitespace-nowrap font-mono text-xs text-muted">
              <time dateTime={submission.updatedAt.toISOString()}>
                <LocalTime value={submission.updatedAt} />
              </time>
            </Td>
            {archived ? (
              <Td>
                {submission.status === "withdrawn" ? (
                  <ArchivedActions
                    id={submission.id}
                    name={itemNameOf(submission)}
                    canDelete={deletable?.[submission.id] ?? false}
                  />
                ) : null}
              </Td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
};
