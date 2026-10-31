import { ITEM_TYPES } from "@ronneai/core";
import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
} from "@/server/domains/submissions/models/status";
import { itemNameOf, type Submission } from "@/server/domains/submissions/models/submission";
import { WithdrawButton } from "../draft-editor/SubmitDialogs";
import { ReleaseSelectCell } from "../releases/BulkRelease";
import { ArchivedActions } from "./ArchivedActions";
import { ReadinessMark, SelectCell } from "./BulkSubmit";
import { SUBMISSIONS_LIST, type SubmissionsList, type SubmissionsListState } from "./list";

/** The filters' order: archived last, after everything still in play. */
const FILTER_ORDER: readonly SubmissionStatus[] = [
  ...SUBMISSION_STATUSES.filter((s) => s !== "withdrawn"),
  "withdrawn",
];

const chipClasses =
  "rounded-full border border-hairline px-3 py-1 text-xs text-muted hover:text-fg aria-[current=page]:border-transparent aria-[current=page]:bg-fg aria-[current=page]:text-canvas outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** A status link: that status, keeping the sort and size, without a search or type (063). */
const statusHref = (
  list: SubmissionsList,
  state: SubmissionsListState,
  status: SubmissionStatus | "",
) => listUrl(list, state, { filters: { status, q: "", type: "" } });

/**
 * Status filters (feature 013): All, then each status you have, with its count; Archived last, and
 * not counted in All (057). The counts come from the server, one query for all of them (063).
 */
export const StatusFilters = ({
  counts,
  state,
  list = SUBMISSIONS_LIST,
}: {
  counts: Partial<Record<SubmissionStatus, number>>;
  state: SubmissionsListState;
  /** The list, with the workspace it keeps (120). */
  list?: SubmissionsList;
}) => {
  const t = useTranslations("author");
  const status = state.filters.status;
  const shown = FILTER_ORDER.filter((s) => (counts[s] ?? 0) > 0);
  if (shown.length < 2 && !status && !counts.withdrawn) return null;
  const all = Object.entries(counts)
    .filter(([s]) => s !== "withdrawn")
    .reduce((sum, [, n]) => sum + (n ?? 0), 0);
  return (
    <nav aria-label={t("submissions.filterLabel")} className="flex flex-wrap gap-2 pb-4">
      <Link
        href={statusHref(list, state, "")}
        aria-current={status === "" ? "page" : undefined}
        className={chipClasses}
      >
        {t("submissions.all", { count: all })}
      </Link>
      {shown.map((s) => (
        <Link
          key={s}
          href={statusHref(list, state, s)}
          aria-current={status === s ? "page" : undefined}
          className={chipClasses}
        >
          {t("submissions.statusCount", { status: t(`status.${s}`), count: counts[s] ?? 0 })}
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
const FeedbackLine = ({ feedback }: { feedback?: RowFeedback }) => {
  const t = useTranslations("author.submissions");
  return feedback ? (
    <p className="mt-1 max-w-prose text-xs text-muted" title={feedback.body ?? undefined}>
      <span className="font-semibold">
        {t(feedback.body ? "feedbackWithBody" : "feedback", {
          kind: feedback.kind,
          by: feedback.by,
        })}
        {feedback.body ? " " : null}
      </span>
      {feedback.body ? shortened(feedback.body) : null}
    </p>
  ) : null;
};

/** The search and type filter (063): one GET form that submits on change, and chips. */
const Filters = ({ list, state }: { list: SubmissionsList; state: SubmissionsListState }) => {
  const t = useTranslations("author.submissions");
  return (
    <div className="grid gap-2">
      <Form
        action={list.path}
        scroll={false}
        className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <HiddenListFields list={list} state={state} omit={["q", "type"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="submissions-search">{t("search")}</Label>
          <Input
            id="submissions-search"
            name="q"
            type="search"
            placeholder={t("searchPlaceholder")}
            maxLength={100}
            defaultValue={state.filters.q}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="submissions-type">{t("type")}</Label>
          <select
            id="submissions-type"
            name="type"
            defaultValue={state.filters.type}
            className={selectClasses}
          >
            <option value="">{t("anyType")}</option>
            {ITEM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" data-submit className={buttonClasses("secondary")}>
            {t("filter")}
          </button>
          <SubmitOnChange />
        </div>
      </Form>
      <FilterChips
        list={list}
        state={state}
        labels={{ status: t("status"), q: t("search"), type: t("type") }}
        hidden={["status"]}
      />
    </div>
  );
};

/** "You have no drafts yet.", for someone with no submissions at all. */
export const NoSubmissions = () => {
  const t = useTranslations("author.submissions");
  return (
    <Panel padding="lg" className="grid justify-items-start gap-3">
      <p className="text-sm text-fg">{t("noDraftsTitle")}</p>
      <p className="text-sm text-muted">{t("noDrafts")}</p>
      <Link href="/submissions/new" className={buttonClasses("primary")}>
        {t("newItem")}
      </Link>
    </Panel>
  );
};

type Row = Submission & { stale?: string | null };

/**
 * My submissions (feature 012, on the server data table since 063): your drafts and submissions,
 * a page at a time, newest change first unless sorted by name. `actions` sits between the filters
 * and the table: the bulk toolbars.
 */
export const SubmissionsTable = ({
  list = SUBMISSIONS_LIST,
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
  /** The list, with the workspace it keeps (120). */
  list?: SubmissionsList;
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
  const t = useTranslations("author.submissions");
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
            srHeader: t("select"),
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
      header: t("item"),
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
      header: t("type"),
      className: "w-24",
      hideOnMobile: true,
      render: (row) => <TypeBadge type={row.type} />,
    },
    {
      id: "status",
      header: t("status"),
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
      header: t("lastChange"),
      sort: "updated",
      className: "w-48",
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
      list={list}
      state={state}
      columns={columns}
      rows={submissions}
      rowKey={(row) => row.id}
      page={page}
      total={total}
      noun="submission"
      toolbar={
        <>
          <Filters list={list} state={state} />
          {actions}
        </>
      }
      empty={{
        none: t(state.filters.status === "withdrawn" ? "nothingArchived" : "nothingHere"),
        filtered: t("noMatch"),
      }}
      pinned={["status"]}
    />
  );
};
