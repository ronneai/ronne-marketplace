import { Info } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
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
import { type SummaryPart, summaryText, useSummarize } from "./summary";

/** The filters: one GET form that submits on change, and a chip per active filter. */
const Filters = ({ state }: { state: AuditListState }) => {
  const t = useTranslations("admin.audit");
  const { filters } = state;
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
          <Label htmlFor="action">{t("filters.action")}</Label>
          <select id="action" name="action" defaultValue={filters.action} className={selectClasses}>
            <option value="">{t("filters.allActions")}</option>
            {ACTION_OPTIONS.map((option) => (
              <optgroup key={option.group} label={option.group}>
                <option value={option.all}>{t("filters.all", { group: option.all })}</option>
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
            <Label htmlFor="actor">{t("filters.actor")}</Label>
            <Help id="audit-actor" />
          </div>
          <Input
            id="actor"
            name="actor"
            type="search"
            placeholder={t("filters.actorPlaceholder")}
            defaultValue={filters.actor}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="from">{t("filters.from")}</Label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">{t("filters.to")}</Label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} />
        </div>
        <div className="flex gap-2">
          <button type="submit" data-submit className={buttonClasses("secondary")}>
            {t("filters.apply")}
          </button>
          <SubmitOnChange />
        </div>
      </Form>
      <FilterChips
        list={AUDIT_LIST}
        state={state}
        labels={{
          action: t("chips.action"),
          actor: t("chips.actor"),
          from: t("chips.from"),
          to: t("chips.to"),
        }}
      />
    </div>
  );
};

type AuditT = ReturnType<typeof useTranslations<"admin.audit">>;

const columns = (
  state: AuditListState,
  t: AuditT,
  summarize: (event: AuditEvent) => SummaryPart[],
): Column<AuditEvent, "time" | "action">[] => [
  {
    id: "time",
    header: t("columns.time"),
    sort: "time",
    className: "w-52",
    truncate: true,
    render: (event) => <LocalTime value={event.createdAt} precision="minute" />,
  },
  {
    id: "actor",
    header: t("columns.actor"),
    className: "w-56",
    truncate: true,
    hideOnMobile: true,
    render: (event) => (
      <span title={actorLabel(event)} className="text-[13px]">
        {actorLabel(event)}
      </span>
    ),
  },
  {
    id: "event",
    header: t("columns.event"),
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
        aria-label={t("detailsLink", { summary: summaryText(summarize(event)) })}
        title={t("detailsTitle")}
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
  const t = useTranslations("admin.audit");
  const summarize = useSummarize();
  const closeHref = listUrl(AUDIT_LIST, state);
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Help id="audit-summary" />
            <Help id="audit-incident" />
          </>
        }
      />
      {selected === "missing" ? <Notice kind="info" title={t("missing")} className="mb-4" /> : null}
      <DataTable
        list={AUDIT_LIST}
        state={state}
        columns={columns(state, t, summarize)}
        rows={events}
        rowKey={(event) => event.id}
        page={page}
        total={total}
        noun="event"
        toolbar={<Filters state={state} />}
        empty={{ none: t("empty.none"), filtered: t("empty.filtered") }}
      />
      {selected && selected !== "missing" ? (
        <>
          <EventDialog title={t("dialog.title")} closeHref={closeHref}>
            <EventDetails event={selected} />
          </EventDialog>
          {/* Without JavaScript the dialog can't open, so the details show here instead. */}
          <noscript>
            <Panel className="mt-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{t("dialog.title")}</h2>
                <a href={closeHref} className="text-link">
                  {t("dialog.close")}
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
