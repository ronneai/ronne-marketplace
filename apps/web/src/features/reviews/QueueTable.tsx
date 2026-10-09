import { ITEM_TYPES } from "@ronneai/core";
import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { DependencyMarksIcon } from "@/components/submissions/DependencyMarks";
import { ProposalBadges } from "@/components/submissions/ProposalBadges";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { ScrollStrip } from "@/components/ui/ScrollStrip";
import { stripTab } from "@/components/ui/scroll-strip";
import { TypeBadge } from "@/components/ui/TypeBadge";
import type { QueueRow, QueueTab } from "@/server/domains/submissions/actions/reviews";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { QUEUE_TABS } from "@/server/domains/submissions/services/queue";
import { ReleaseSelectCell } from "../releases/BulkRelease";
import { type ApprovableRow, ApproveSelectCell } from "./BulkApprove";
import { RowDecisions } from "./DecisionBar";
import type { QueueList, QueueListState } from "./list";

const TAB_ORDER: QueueTab[] = ["needs", "waiting", "release", "decided"];

const EMPTY: Record<QueueTab, string> = {
  needs: "Nothing needs review. New submissions show up here.",
  waiting: "No submission is waiting on its author.",
  release: "Nothing approved is waiting to be released.",
  decided: "Nothing has been decided yet.",
};

/** `?tab=`, when it's a tab; otherwise Needs review. */
export const queueTab = (value: string | string[] | undefined): QueueTab => {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "waiting" || tab === "release" || tab === "decided" ? tab : "needs";
};

const tabClasses =
  "rounded-control px-3 py-1.5 text-sm text-muted hover:text-fg aria-[current=page]:bg-tint aria-[current=page]:font-semibold aria-[current=page]:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * The review queue's tabs (feature 014), as links, so they work without JavaScript. On a phone
 * they scroll sideways instead of wrapping (066).
 */
export const QueueTabs = ({ tab }: { tab: QueueTab }) => (
  <ScrollStrip label="Review queue" className="mb-4 gap-1">
    {TAB_ORDER.map((id) => (
      <Link
        key={id}
        href={id === "needs" ? "/reviews" : `/reviews?tab=${id}`}
        aria-current={id === tab ? "page" : undefined}
        className={`${stripTab} ${tabClasses}`}
      >
        {QUEUE_TABS[id].label}
      </Link>
    ))}
  </ScrollStrip>
);

/** The rows this reviewer can approve now, for BulkApproveProvider (054). */
export const approvableRows = (rows: QueueRow[]): Record<string, ApprovableRow> =>
  Object.fromEntries(
    rows.flatMap((row) =>
      row.approvable.approvable
        ? [
            [
              row.id,
              {
                name: itemNameOf(row),
                type: row.type,
                author: row.authorName,
                revision: row.revision,
                riskKinds: row.riskKinds,
                override: row.approvable.override,
              },
            ],
          ]
        : [],
    ),
  );

/** Tabs whose rows can be decided from the queue (058): Needs review, and To release (056). */
const DECIDING: readonly QueueTab[] = ["needs", "release"];

const TIME_HEADER: Record<QueueTab, string> = {
  needs: "Submitted",
  waiting: "Submitted",
  release: "Approved",
  decided: "Decided",
};

/**
 * The search, type and workspace filters (062, 091): one GET form that submits on change, and
 * chips. Workspace shows when the reviewer moderates several (root: when there are several).
 */
const Filters = ({
  list,
  state,
  workspaces,
  everyLabel,
}: {
  list: QueueList;
  state: QueueListState;
  workspaces: readonly string[];
  everyLabel: string;
}) => {
  const picked = state.filters.workspace;
  const options = picked && !workspaces.includes(picked) ? [...workspaces, picked] : workspaces;
  const byWorkspace = options.length > 1;
  return (
    <div className="grid gap-2">
      <Form
        action={list.path}
        scroll={false}
        className={
          byWorkspace
            ? "grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            : "grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
        }
      >
        <HiddenListFields
          list={list}
          state={state}
          omit={byWorkspace ? ["q", "type", "workspace"] : ["q", "type"]}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="queue-search">Search</Label>
          <Input
            id="queue-search"
            name="q"
            type="search"
            placeholder="Item or author"
            maxLength={100}
            defaultValue={state.filters.q}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="queue-type">Type</Label>
          <select
            id="queue-type"
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
        {byWorkspace ? (
          <div className="grid gap-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="queue-workspace">Workspace</Label>
              <Help id="queue-workspaces" />
            </div>
            <select
              id="queue-workspace"
              name="workspace"
              defaultValue={picked}
              className={selectClasses}
            >
              <option value="">{everyLabel}</option>
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex gap-2">
          <button type="submit" data-submit className={buttonClasses("secondary")}>
            Filter
          </button>
          <SubmitOnChange />
        </div>
      </Form>
      <FilterChips
        list={list}
        state={state}
        labels={{ q: "Search", type: "Type", workspace: "Workspace" }}
      />
    </div>
  );
};

/** A tab's time: the first submit, the approval, or the decision. */
const timeOf = (tab: QueueTab, row: QueueRow): Date =>
  tab === "decided"
    ? row.updatedAt
    : tab === "release"
      ? (row.approved?.at ?? row.updatedAt)
      : (row.submittedAt ?? row.updatedAt);

const columns = (tab: QueueTab): Column<QueueRow, "time" | "name">[] => [
  ...(tab === "release"
    ? [
        {
          id: "select",
          header: "",
          srHeader: "Select",
          className: "w-10",
          render: (row: QueueRow) => <ReleaseSelectCell id={row.id} name={itemNameOf(row)} />,
        },
      ]
    : []),
  ...(tab === "needs"
    ? [
        {
          id: "select",
          header: "",
          srHeader: "Select",
          className: "w-10",
          render: (row: QueueRow) => (
            <ApproveSelectCell
              id={row.id}
              name={itemNameOf(row)}
              reason={row.approvable.approvable ? null : row.approvable.reason}
            />
          ),
        },
      ]
    : []),
  {
    id: "item",
    header: "Item",
    sort: "name",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <Link
          href={`/reviews/${row.id}`}
          title={itemNameOf(row)}
          className="min-w-0 truncate font-mono text-sm text-link hover:underline"
        >
          {itemNameOf(row)}
        </Link>
        {/* The type and badges keep their size; the name gives way. */}
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <TypeBadge type={row.type} />
          <ProposalBadges proposal={row.proposal} stale={row.stale} />
          {row.risky ? <Badge tone="warning">⚠ risk</Badge> : null}
          {row.mine ? <Badge>yours</Badge> : null}
          <DependencyMarksIcon marks={row.marks} />
        </span>
      </span>
    ),
  },
  {
    id: "author",
    header: "Author",
    // Half as wide again (owner, 2026-10-09), so a full name fits before it's cut.
    className: "w-42",
    truncate: true,
    hideOnMobile: true,
    render: (row) => <span title={row.authorName}>{row.authorName}</span>,
  },
  {
    id: "revision",
    header: "Revision",
    className: "w-16",
    mono: true,
    hideOnMobile: true,
    render: (row) => row.revision ?? "–",
  },
  ...(tab === "release"
    ? [
        {
          id: "approver",
          header: "Approved by",
          className: "w-32",
          truncate: true,
          hideOnMobile: true,
          render: (row: QueueRow) => row.approved?.by ?? "–",
        },
      ]
    : []),
  {
    id: "time",
    header: TIME_HEADER[tab],
    sort: "time",
    className: "w-48",
    mono: true,
    truncate: true,
    render: (row) => <LocalTime value={timeOf(tab, row)} />,
  },
  ...(tab === "decided"
    ? [
        {
          id: "status",
          header: "Status",
          className: "w-28",
          render: (row: QueueRow) => <StatusBadge status={row.status} />,
        },
      ]
    : []),
  ...(DECIDING.includes(tab)
    ? [
        {
          id: "decisions",
          header: "",
          srHeader: "Decisions",
          className: "w-52",
          align: "right" as const,
          render: (row: QueueRow) => (
            <RowDecisions id={row.id} name={itemNameOf(row)} decisions={row.decisions} />
          ),
        },
      ]
    : []),
];

/**
 * One tab of the queue (014, on the server data table since 062): each submission, who sent it,
 * since when, and whether it's risky, a page at a time. Needs review has a checkbox on each row for
 * approving many (054) and To release for releasing many (055), inside their providers; both end
 * each row with its own decisions (058). `actions` sits between the filters and the table: the
 * bulk toolbar.
 */
export const QueueTable = ({
  tab,
  list,
  state,
  rows,
  page,
  total,
  actions,
  workspaces = [],
  root = false,
}: {
  tab: QueueTab;
  list: QueueList;
  state: QueueListState;
  rows: QueueRow[];
  /** The workspaces the reviewer moderates, by name (091); every one for root. */
  workspaces?: readonly string[];
  root?: boolean;
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  actions?: ReactNode;
}) => (
  <DataTable
    list={list}
    state={state}
    columns={columns(tab)}
    rows={rows}
    rowKey={(row) => row.id}
    page={page}
    total={total}
    noun={total.count === 1 && !total.capped ? "submission" : "submissions"}
    toolbar={
      <>
        <Filters
          list={list}
          state={state}
          workspaces={workspaces}
          everyLabel={root ? "Every workspace" : "Every workspace you moderate"}
        />
        {actions}
      </>
    }
    empty={{ none: EMPTY[tab], filtered: "No submissions match these filters." }}
  />
);
