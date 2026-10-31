import Form from "next/form";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import type { FeedbackEntry } from "@/server/domains/feedback/models/feedback";
import { BulkBar, DetailButton, InboxProvider, SelectCell } from "./InboxSelection";
import { FEEDBACK_KINDS, FEEDBACK_LIST, FEEDBACK_STATUSES, type FeedbackListState } from "./list";
import type { InboxRow } from "./types";

/** The row as the browser gets it: dates as text. */
const rowOf = (entry: FeedbackEntry): InboxRow => ({
  id: entry.id,
  kind: entry.kind,
  message: entry.message,
  page: entry.page,
  version: entry.version,
  status: entry.status,
  createdAt: entry.createdAt.toISOString(),
  handledAt: entry.handledAt ? entry.handledAt.toISOString() : null,
  sender: { name: entry.sender.name, email: entry.sender.email },
});

const Filters = ({ state }: { state: FeedbackListState }) => {
  const t = useTranslations("feedback.admin");
  const tKind = useTranslations("feedback.kind");
  const labels = { q: t("filters.search"), kind: t("columns.kind"), status: t("columns.status") };
  return (
    <div className="grid gap-2">
      <Form
        action={FEEDBACK_LIST.path}
        scroll={false}
        className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] sm:items-end"
      >
        <HiddenListFields list={FEEDBACK_LIST} state={state} omit={["q", "kind", "status"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="q">{t("filters.search")}</Label>
          <Input
            id="q"
            name="q"
            type="search"
            placeholder={t("filters.searchPlaceholder")}
            maxLength={100}
            defaultValue={state.filters.q}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="kind">{t("columns.kind")}</Label>
          <select id="kind" name="kind" defaultValue={state.filters.kind} className={selectClasses}>
            <option value="">{t("filters.anyKind")}</option>
            {FEEDBACK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {tKind(kind)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">{t("columns.status")}</Label>
          <select
            id="status"
            name="status"
            defaultValue={state.filters.status}
            className={selectClasses}
          >
            <option value="">{t("filters.anyStatus")}</option>
            {FEEDBACK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" data-submit className={buttonClasses("secondary")}>
            {t("filters.apply")}
          </button>
          <SubmitOnChange />
        </div>
      </Form>
      <FilterChips
        list={FEEDBACK_LIST}
        state={state}
        labels={labels}
        display={{
          kind: (value) => tKind(value as "problem"),
          status: (value) => t(`status.${value as "new"}`),
        }}
      />
    </div>
  );
};

/**
 * /admin/feedback (feature 127): what people sent from Send feedback, newest first. Root's alone;
 * the page checks. A message is plain text, shown as text. The table is on the server and its
 * whole state is in the URL (060); selecting rows, the detail dialog and the bulk actions are the
 * client parts of InboxSelection.
 */
export const FeedbackInbox = ({
  state,
  entries,
  page,
  total,
}: {
  state: FeedbackListState;
  entries: FeedbackEntry[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
}) => {
  const t = useTranslations("feedback.admin");
  const tKind = useTranslations("feedback.kind");
  const rows = entries.map(rowOf);
  const columns: Column<InboxRow, "created" | "kind">[] = [
    {
      id: "select",
      header: "",
      srHeader: t("columns.select"),
      className: "w-10",
      render: (row) => <SelectCell id={row.id} name={row.sender.name} />,
    },
    {
      id: "from",
      header: t("columns.from"),
      className: "w-56",
      truncate: true,
      render: (row) => (
        <span title={row.sender.email} className="block min-w-0 truncate">
          {row.sender.name}
          <span className="block truncate text-xs text-muted">{row.sender.email}</span>
        </span>
      ),
    },
    {
      id: "kind",
      header: t("columns.kind"),
      sort: "kind",
      className: "w-28",
      nowrap: true,
      render: (row) => <Badge>{tKind(row.kind as "problem")}</Badge>,
    },
    {
      id: "message",
      header: t("columns.message"),
      truncate: true,
      render: (row) => (
        // The first line of it, cut: the whole message is in the detail dialog.
        <span title={row.message} className="block min-w-0 truncate">
          {row.message}
        </span>
      ),
    },
    {
      id: "page",
      header: t("columns.page"),
      className: "w-40",
      mono: true,
      truncate: true,
      hideOnMobile: true,
      render: (row) => row.page ?? <span className="text-muted">–</span>,
    },
    {
      id: "version",
      header: t("columns.version"),
      className: "w-24",
      mono: true,
      nowrap: true,
      hideOnMobile: true,
      render: (row) => row.version,
    },
    {
      id: "status",
      header: t("columns.status"),
      className: "w-24",
      nowrap: true,
      render: (row) => (
        <span className={row.status === "new" ? "font-semibold" : "text-muted"}>
          {t(`status.${row.status as "new"}`)}
        </span>
      ),
    },
    {
      id: "sent",
      header: t("columns.sent"),
      sort: "created",
      className: "w-48",
      nowrap: true,
      hideOnMobile: true,
      render: (row) => <LocalTime value={row.createdAt} />,
    },
    {
      id: "open",
      header: "",
      srHeader: t("columns.open"),
      className: "w-14",
      align: "right",
      nowrap: true,
      render: (row) => <DetailButton row={row} />,
    },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <InboxProvider ids={rows.map((row) => row.id)}>
        <DataTable
          list={FEEDBACK_LIST}
          state={state}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          rowLabel={(row) => `${row.sender.name}: ${row.kind}`}
          page={page}
          total={total}
          noun="message"
          toolbar={
            <div className="grid gap-3">
              <Filters state={state} />
              <BulkBar />
            </div>
          }
          empty={{ none: t("empty.none"), filtered: t("empty.filtered") }}
        />
      </InboxProvider>
    </>
  );
};
