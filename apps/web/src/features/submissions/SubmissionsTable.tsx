import { ITEM_TYPES } from "@ronneai/core";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { DependencyMarksIcon } from "@/components/submissions/DependencyMarks";
import { ProposalBadges } from "@/components/submissions/ProposalBadges";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { listUrl } from "@/components/ui/data-table/list-query";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Panel } from "@/components/ui/Panel";
import { TypeBadge } from "@/components/ui/TypeBadge";
import type { DependencyMark, RowFeedback } from "@/server/domains/submissions/actions/submissions";
import {
  canTransition,
  SUBMISSION_STATUSES,
  type SubmissionStatus,
  statusLabel,
} from "@/server/domains/submissions/models/status";
import { itemNameOf, type Submission } from "@/server/domains/submissions/models/submission";
import { WithdrawButton } from "../draft-editor/SubmitDialogs";
import { ReleaseSelectCell } from "../releases/BulkRelease";
import { ArchivedActions } from "./ArchivedActions";
import { ReadinessMark, SelectCell } from "./BulkSubmit";
import { SUBMISSIONS_LIST, type SubmissionsListState } from "./list";

/** The filters' order: archived last, after everything still in play. */
const FILTER_ORDER: readonly SubmissionStatus[] = [
  ...SUBMISSION_STATUSES.filter((s) => s !== "withdrawn"),
  "withdrawn",
];

const chipClasses =
  "rounded-full border border-hairline px-3 py-1 font-mono text-xs text-muted hover:text-fg aria-[current=page]:border-transparent aria-[current=page]:bg-fg aria-[current=page]:text-canvas outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** A status link: that status, keeping the sort and size, without a search or type (063). */
const statusHref = (state: SubmissionsListState, status: SubmissionStatus | "") =>
  listUrl(SUBMISSIONS_LIST, state, { filters: { status, q: "", type: "" } });

/**
 * Status filters (feature 013): All, then each status you have, with its count; Archived last, and
 * not counted in All (057). The counts come from the server, one query for all of them (063).
 */
export const StatusFilters = ({
  counts,
  state,
}: {
  counts: Partial<Record<SubmissionStatus, number>>;
  state: SubmissionsListState;
}) => {
  const status = state.filters.status;
  const shown = FILTER_ORDER.filter((s) => (counts[s] ?? 0) > 0);
  if (shown.length < 2 && !status && !counts.withdrawn) return null;
  const all = Object.entries(counts)
    .filter(([s]) => s !== "withdrawn")
    .reduce((sum, [, n]) => sum + (n ?? 0), 0);
  return (
    <nav aria-label="Filter by status" className="flex flex-wrap gap-2 pb-4">
      <Link
        href={statusHref(state, "")}
        aria-current={status === "" ? "page" : undefined}
        className={chipClasses}
      >
        All ({all})
      </Link>
      {shown.map((s) => (
        <Link
          key={s}
          href={statusHref(state, s)}
          aria-current={status === s ? "page" : undefined}
          className={chipClasses}
        >
          {statusLabel(s)} ({counts[s]})
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

/** The search and type filter (063): one GET form that submits on change, and chips. */
const Filters = ({ state }: { state: SubmissionsListState }) => (
  <div className="grid gap-2">
    <Form
      action={SUBMISSIONS_LIST.path}
      scroll={false}
      className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <HiddenListFields list={SUBMISSIONS_LIST} state={state} omit={["q", "type"]} />
      <div className="grid gap-1.5">
        <Label htmlFor="submissions-search">Search</Label>
        <Input
          id="submissions-search"
          name="q"
          type="search"
          placeholder="Item name"
          maxLength={100}
          defaultValue={state.filters.q}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="submissions-type">Type</Label>
        <select
          id="submissions-type"
          name="type"
          defaultValue={state.filters.type}
          className={selectClasses}
        >
          <option value="">Any type</option>
          {ITEM_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" data-submit className={buttonClasses("secondary")}>
          Filter
        </button>
        <SubmitOnChange />
      </div>
    </Form>
    <FilterChips
      list={SUBMISSIONS_LIST}
      state={state}
      labels={{ status: "Status", q: "Search", type: "Type" }}
      hidden={["status"]}
    />
  </div>
);

/** "You have no drafts yet.", for someone with no submissions at all. */
export const NoSubmissions = () => (
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

type Row = Submission & { stale?: string | null };

/**
 * My submissions (feature 012, on the server data table since 063): your drafts and submissions,
 * a page at a time, newest change first unless sorted by name. `actions` sits between the filters
 * and the table: the bulk toolbars.
 */
export const SubmissionsTable = ({
  state,
  submissions,
  page,
  total,
  actions,
  errors,
  marks,
  releasable,
  deletable,
  feedback,
}: {
  state: SubmissionsListState;
  /** With `stale` for change proposals (017) that a newer version overtook. */
  submissions: Row[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  actions?: ReactNode;
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
  // Archived rows get Restore and Delete (057); the others, Withdraw until released (058).
  const withActions = submissions.some(
    (s) => s.status === "withdrawn" || canTransition(s.status, "withdraw"),
  );
  const columns: Column<Row, "updated" | "name">[] = [
    ...(selecting
      ? [
          {
            id: "select",
            header: "",
            srHeader: "Select",
            className: "w-10",
            render: (row: Row) =>
              errors?.[row.id] !== undefined ? (
                <SelectCell id={row.id} name={itemNameOf(row)} errors={errors[row.id] ?? 0} />
              ) : releasable?.[row.id] ? (
                <ReleaseSelectCell id={row.id} name={itemNameOf(row)} />
              ) : null,
          },
        ]
      : []),
    {
      id: "item",
      header: "Item",
      sort: "name",
      render: (row) => (
        <>
          <span className="flex min-w-0 items-center gap-2">
            <Link
              href={`/submissions/${row.id}`}
              title={itemNameOf(row)}
              className="min-w-0 truncate font-mono text-sm text-link hover:underline"
            >
              {itemNameOf(row)}
            </Link>
            {row.proposal ? (
              <span className="flex shrink-0 gap-1">
                <ProposalBadges proposal={row.proposal} stale={row.stale} />
              </span>
            ) : null}
          </span>
          <FeedbackLine feedback={feedback?.[row.id]} />
        </>
      ),
    },
    {
      id: "type",
      header: "Type",
      className: "w-24",
      hideOnMobile: true,
      render: (row) => <TypeBadge type={row.type} />,
    },
    {
      id: "status",
      header: "Status",
      className: "w-44",
      render: (row) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <StatusBadge status={row.status} />
          {errors?.[row.id] !== undefined ? (
            <ReadinessMark id={row.id} errors={errors[row.id] ?? 0} />
          ) : null}
          <DependencyMarksIcon marks={marks?.[row.id]} />
        </span>
      ),
    },
    {
      id: "updated",
      header: "Last change",
      sort: "updated",
      className: "w-48",
      mono: true,
      truncate: true,
      hideOnMobile: true,
      render: (row) => <LocalTime value={row.updatedAt} />,
    },
    ...(withActions
      ? [
          {
            id: "actions",
            header: "",
            className: "w-36",
            align: "right" as const,
            render: (row: Row) =>
              row.status === "withdrawn" ? (
                <ArchivedActions
                  id={row.id}
                  name={itemNameOf(row)}
                  canDelete={deletable?.[row.id] ?? false}
                />
              ) : canTransition(row.status, "withdraw") ? (
                <WithdrawButton draftId={row.id} itemName={itemNameOf(row)} />
              ) : null,
          },
        ]
      : []),
  ];
  return (
    <DataTable
      list={SUBMISSIONS_LIST}
      state={state}
      columns={columns}
      rows={submissions}
      rowKey={(row) => row.id}
      page={page}
      total={total}
      noun={total.count === 1 && !total.capped ? "submission" : "submissions"}
      toolbar={
        <>
          <Filters state={state} />
          {actions}
        </>
      }
      empty={{
        none:
          state.filters.status === "withdrawn"
            ? "Nothing archived."
            : "Nothing here: try another status.",
        filtered: "No submissions match these filters.",
      }}
      pinned={["status"]}
    />
  );
};
