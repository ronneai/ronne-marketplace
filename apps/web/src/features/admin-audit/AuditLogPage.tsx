import { Info, X } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { listUrl } from "@/components/ui/data-table/list-query";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, Panel } from "@/components/ui/Panel";
import type { AuditEvent } from "@/server/domains/audit/models/audit-event";
import { EventDetails, Summary } from "./EventDetails";
import { EventDialog } from "./EventDialog";
import { actorLabel } from "./format";
import { ACTION_OPTIONS, AUDIT_LIST, type AuditListState } from "./list";
import { summarize, summaryText } from "./summary";

type Filter = keyof AuditListState["filters"];
const CHIP_LABELS: Record<Filter, string> = {
  action: "Action",
  actor: "Actor",
  from: "From",
  to: "To",
};

/** The filters: one GET form that submits on change, and a chip per active filter. */
const Filters = ({ state }: { state: AuditListState }) => {
  const { filters } = state;
  const active = (Object.keys(filters) as Filter[]).filter((key) => filters[key]);
  return (
    <div className="grid gap-2">
      <Form
        action={AUDIT_LIST.path}
        scroll={false}
        className="grid gap-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
      >
        <HiddenListFields
          list={AUDIT_LIST}
          state={state}
          omit={["action", "actor", "from", "to"]}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="action">Action</Label>
          <select id="action" name="action" defaultValue={filters.action} className={selectClasses}>
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((option) => (
              <optgroup key={option.group} label={option.group}>
                <option value={option.all}>All {option.all}</option>
                {option.actions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center gap-2">
            <Label htmlFor="actor">Actor</Label>
            <Help id="audit-actor" />
          </div>
          <Input
            id="actor"
            name="actor"
            type="search"
            placeholder="Email, or system"
            defaultValue={filters.actor}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from">From (UTC)</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To (UTC)</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="flex gap-2">
          <button type="submit" data-submit className={buttonClasses("secondary")}>
            Filter
          </button>
          <SubmitOnChange />
        </div>
      </Form>
      {active.length > 0 ? (
        <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2 text-xs">
          {active.map((key) => (
            <li key={key}>
              <Link
                href={listUrl(AUDIT_LIST, state, { filters: { [key]: "" } })}
                scroll={false}
                aria-label={`Remove the ${CHIP_LABELS[key].toLowerCase()} filter`}
                className="inline-flex items-center gap-1 rounded-control border border-hairline bg-surface px-2 py-1 text-fg hover:border-strong"
              >
                <span className="text-muted">{CHIP_LABELS[key]}:</span>
                <span className="font-mono">{filters[key]}</span>
                <X size={12} aria-hidden="true" className="text-muted" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={listUrl(AUDIT_LIST, state, {
                filters: { action: "", actor: "", from: "", to: "" },
              })}
              scroll={false}
              className="text-link underline-offset-2 hover:underline"
            >
              Clear
            </Link>
          </li>
        </ul>
      ) : null}
    </div>
  );
};

const columns = (state: AuditListState): Column<AuditEvent, "time" | "action">[] => [
  {
    id: "time",
    header: "Time",
    sort: "time",
    className: "w-52",
    mono: true,
    truncate: true,
    render: (event) => <LocalTime value={event.createdAt} precision="minute" />,
  },
  {
    id: "actor",
    header: "Actor",
    className: "w-56",
    truncate: true,
    hideOnMobile: true,
    render: (event) => (
      <span title={actorLabel(event)} className="font-mono text-[13px]">
        {actorLabel(event)}
      </span>
    ),
  },
  {
    id: "event",
    header: "Event",
    sort: "action",
    render: (event) => {
      const parts = summarize(event);
      return (
        <span className="flex min-w-0 items-center gap-2" title={summaryText(parts)}>
          <Badge>{event.action}</Badge>
          <span className="min-w-0 truncate text-muted">
            <Summary parts={parts} />
          </span>
        </span>
      );
    },
  },
  {
    id: "details",
    header: "",
    className: "w-12",
    align: "right",
    render: (event) => (
      // The link covers the whole row (the row is `relative`), so clicking anywhere opens it.
      <Link
        href={listUrl(AUDIT_LIST, state, {}, { event: event.id })}
        scroll={false}
        aria-label={`Details: ${summaryText(summarize(event))}`}
        title="Details"
        className="inline-flex size-7 items-center justify-center rounded-control text-muted after:absolute after:inset-0 hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Info size={16} aria-hidden="true" />
      </Link>
    ),
  },
];

/**
 * /admin/audit (spec 007, redesigned in 060): one line per event on the server data table, and
 * everything recorded about one event in a dialog, opened by `?event=`. Read-only.
 */
export const AuditLogPage = ({
  state,
  events,
  page,
  total,
  selected,
}: {
  state: AuditListState;
  events: AuditEvent[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  /** The event in `?event=`: the event, "missing" when there's none with that id, or nothing. */
  selected?: AuditEvent | "missing";
}) => {
  const closeHref = listUrl(AUDIT_LIST, state);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who did what, and when. Open an event for every detail."
        actions={<Help id="audit-summary" />}
      />
      {selected === "missing" ? (
        <Notice kind="info" title="That event doesn't exist." className="mb-4" />
      ) : null}
      <DataTable
        list={AUDIT_LIST}
        state={state}
        columns={columns(state)}
        rows={events}
        rowKey={(event) => event.id}
        page={page}
        total={total}
        noun={total.count === 1 && !total.capped ? "event" : "events"}
        toolbar={<Filters state={state} />}
        empty={{
          none: "No events yet.",
          filtered: "No events match these filters.",
        }}
      />
      {selected && selected !== "missing" ? (
        <>
          <EventDialog title="Event details" closeHref={closeHref}>
            <EventDetails event={selected} />
          </EventDialog>
          {/* Without JavaScript the dialog can't open, so the details show here instead. */}
          <noscript>
            <Panel className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Event details</h2>
                <a href={closeHref} className="text-link">
                  Close
                </a>
              </div>
              <EventDetails event={selected} />
            </Panel>
          </noscript>
        </>
      ) : null}
    </>
  );
};
