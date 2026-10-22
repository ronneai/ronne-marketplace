"use client";

import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { LocalTime } from "@/components/ui/LocalTime";
import { deleteFeedbackAction, markHandledAction } from "./actions";
import type { FeedbackBulkResult, InboxRow } from "./types";

/**
 * The inbox's client parts (feature 127): the rows' checkboxes, the bar with Mark handled and
 * Delete for the selected ones, the Delete confirmation, and a message's detail dialog. They share
 * one selection. Each action sends the ids of the rows it is about, nothing else, and the page is
 * read again afterwards. The table itself stays on the server.
 */
type Inbox = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  ids: readonly string[];
  pending: boolean;
  markHandled: (ids: string[]) => void;
  askDelete: (ids: string[]) => void;
  notice: string | null;
  failure: string | null;
};

const InboxContext = createContext<Inbox | null>(null);

const useInbox = () => {
  const inbox = useContext(InboxContext);
  if (!inbox) throw new Error("The inbox's parts go inside InboxProvider.");
  return inbox;
};

/** Holds the selection for the rows' checkboxes and the bar. `ids` are the rows on this page. */
export const InboxProvider = ({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) => {
  const t = useTranslations("feedback.admin");
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [toDelete, setToDelete] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const finish = (result: FeedbackBulkResult, done: "handled" | "deleted") => {
    if (result.ok) {
      setNotice(t(`done.${done}`, { count: result.changed }));
      setFailure(null);
      setSelected(new Set());
      router.refresh();
    } else {
      setNotice(null);
      setFailure(t(`errors.${result.error}`, { max: 100 }));
    }
  };
  const inbox: Inbox = {
    selected,
    ids,
    toggle: (id) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    selectAll: () => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
    pending,
    markHandled: (rows) => start(async () => finish(await markHandledAction(rows), "handled")),
    askDelete: (rows) => setToDelete(rows),
    notice,
    failure,
  };
  return (
    <InboxContext.Provider value={inbox}>
      {children}
      <Dialog
        open={toDelete !== null}
        onClose={() => setToDelete(null)}
        title={t("delete.title", { count: toDelete?.length ?? 0 })}
        size="small"
      >
        <div className="grid gap-4">
          <p className="text-sm text-muted">{t("delete.body")}</p>
          <DialogActions>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              {t("delete.cancel")}
            </Button>
            <Button
              variant="destructive"
              loading={pending}
              onClick={() => {
                const rows = toDelete ?? [];
                setToDelete(null);
                start(async () => finish(await deleteFeedbackAction(rows), "deleted"));
              }}
            >
              {t("delete.confirm")}
            </Button>
          </DialogActions>
        </div>
      </Dialog>
    </InboxContext.Provider>
  );
};

/** A row's checkbox. */
export const SelectCell = ({ id, name }: { id: string; name: string }) => {
  const t = useTranslations("feedback.admin");
  const { selected, toggle } = useInbox();
  return (
    <input
      type="checkbox"
      aria-label={t("select", { name })}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      className="size-4 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    />
  );
};

/** Above the table: how many are selected, and what can be done with them. */
export const BulkBar = () => {
  const t = useTranslations("feedback.admin");
  const inbox = useInbox();
  const rows = [...inbox.selected];
  const none = rows.length === 0;
  return (
    <div className="grid gap-2">
      <div
        role="toolbar"
        aria-label={t("bulk.label")}
        className="flex flex-wrap items-center gap-2 text-sm"
      >
        <span className="text-muted" aria-live="polite">
          {t("bulk.selected", { count: rows.length })}
        </span>
        <Button
          variant="secondary"
          disabled={none}
          loading={inbox.pending}
          onClick={() => inbox.markHandled(rows)}
        >
          {t("bulk.markHandled")}
        </Button>
        <Button variant="secondary" disabled={none} onClick={() => inbox.askDelete(rows)}>
          {t("bulk.delete")}
        </Button>
        <Button variant="ghost" onClick={inbox.selectAll}>
          {t("bulk.selectAll")}
        </Button>
        <Button variant="ghost" disabled={none} onClick={inbox.clear}>
          {t("bulk.clear")}
        </Button>
      </div>
      {inbox.notice ? (
        <p role="status" className="text-sm text-fg">
          {inbox.notice}
        </p>
      ) : null}
      {inbox.failure ? (
        <p role="alert" className="text-sm text-error-text">
          {inbox.failure}
        </p>
      ) : null}
    </div>
  );
};

/** The row's way into the whole message, with what can be done with it. */
export const DetailButton = ({ row }: { row: InboxRow }) => {
  const t = useTranslations("feedback.admin");
  const tKind = useTranslations("feedback.kind");
  const inbox = useInbox();
  const [open, setOpen] = useState(false);
  const field = (label: string, value: ReactNode) => (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-fg [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
  return (
    <>
      <IconButton label={t("open", { name: row.sender.name })} onClick={() => setOpen(true)}>
        <Eye size={16} aria-hidden />
      </IconButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("detail.title", { name: row.sender.name })}
        size="large"
      >
        {open ? (
          <div className="grid gap-4">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
              {field(t("detail.from"), `${row.sender.name} <${row.sender.email}>`)}
              {field(t("columns.kind"), <Badge>{tKind(row.kind as "problem")}</Badge>)}
              {field(t("detail.sent"), <LocalTime value={row.createdAt} />)}
              {field(
                t("columns.page"),
                row.page ? (
                  <span className="font-mono text-[13px]">{row.page}</span>
                ) : (
                  t("detail.noPage")
                ),
              )}
              {field(t("columns.version"), <span className="font-mono">{row.version}</span>)}
              {field(
                t("columns.status"),
                row.handledAt ? (
                  <>
                    {t("status.handled")} <LocalTime value={row.handledAt} />
                  </>
                ) : (
                  t("status.new")
                ),
              )}
            </dl>
            {/* Plain text, kept as written: line breaks stay, nothing is read as HTML. */}
            <p className="max-h-80 overflow-y-auto rounded-control border border-hairline bg-canvas p-3 text-sm whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">
              {row.message}
            </p>
            <DialogActions>
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  inbox.askDelete([row.id]);
                }}
              >
                {t("bulk.delete")}
              </Button>
              {row.status === "new" ? (
                <Button
                  onClick={() => {
                    setOpen(false);
                    inbox.markHandled([row.id]);
                  }}
                >
                  {t("bulk.markHandled")}
                </Button>
              ) : null}
            </DialogActions>
          </div>
        ) : null}
      </Dialog>
    </>
  );
};
