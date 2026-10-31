import { useTranslations } from "next-intl";
import { type Column, DataTable } from "@/components/ui/data-table/DataTable";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import type { NotificationView } from "@/server/domains/notifications/services/read";
import { notificationHref } from "./href";
import { NOTIFICATIONS_LIST, type NotificationsListState } from "./list";
import { NotificationFilters } from "./NotificationFilters";
import { BulkBar, OpenLink, SelectCell, SelectionProvider } from "./NotificationsSelection";
import { renderSentence } from "./sentence";

type Row = {
  id: string;
  sentence: string;
  href: string | null;
  unread: boolean;
  createdAt: Date;
};

/**
 * /notifications (feature 139): every notification of the person, newest first, on the server data
 * table (060): its whole state is in the URL. The sentences are drawn here, in the reader's
 * language, from the kind and parameters; a row is a link when what it is about is still there,
 * and opening it marks it read. Selecting rows and marking them read are the client parts.
 */
export const NotificationsPage = ({
  state,
  views,
  page,
  total,
}: {
  state: NotificationsListState;
  views: NotificationView[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
}) => {
  const t = useTranslations("notifications.page");
  const tn = useTranslations("notifications");
  const sentenceOf = (view: NotificationView) =>
    renderSentence(
      (key, values) => (tn as unknown as (k: string, v: typeof values) => string)(key, values),
      view,
      tn("system"),
      tn("fallback"),
    );
  const rows: Row[] = views.map((view) => ({
    id: view.id,
    sentence: sentenceOf(view),
    href: view.link ? notificationHref(view.link) : null,
    unread: view.readAt === null,
    createdAt: view.createdAt,
  }));
  const columns: Column<Row, "created">[] = [
    {
      id: "select",
      header: "",
      srHeader: t("columns.select"),
      className: "w-10",
      render: (row) => <SelectCell id={row.id} sentence={row.sentence} />,
    },
    {
      id: "state",
      header: t("columns.state"),
      className: "w-24",
      nowrap: true,
      render: (row) => (
        <span className={row.unread ? "font-semibold text-fg" : "text-muted"}>
          {t(row.unread ? "state.unread" : "state.read")}
        </span>
      ),
    },
    {
      id: "what",
      header: t("columns.what"),
      render: (row) => (
        <span className={row.unread ? "font-semibold" : "text-muted"}>
          <OpenLink id={row.id} href={row.href} unread={row.unread}>
            {row.sentence}
          </OpenLink>
        </span>
      ),
    },
    {
      id: "when",
      header: t("columns.when"),
      className: "w-48",
      nowrap: true,
      render: (row) => <LocalTime value={row.createdAt} />,
    },
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <SelectionProvider ids={rows.map((row) => row.id)}>
        <DataTable
          list={NOTIFICATIONS_LIST}
          state={state}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          rowLabel={(row) => row.sentence}
          page={page}
          total={total}
          noun="notification"
          toolbar={
            <div className="grid gap-3">
              <NotificationFilters state={state} />
              <BulkBar />
            </div>
          }
          empty={{ none: t("empty.none"), filtered: t("empty.filtered") }}
        />
      </SelectionProvider>
    </>
  );
};
