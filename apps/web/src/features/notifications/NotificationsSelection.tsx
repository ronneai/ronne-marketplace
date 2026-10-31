"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast";
import { markAllRead, markRead } from "./actions";

/**
 * The /notifications page's client parts (feature 139): the rows' checkboxes, the bar with "Mark
 * selected as read" and "Mark all as read", and a row's link, which marks it read when opened. The
 * table itself stays on the server; afterwards the page is read again, so the rows, the total and
 * the bell's badge follow.
 */
type Selection = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  pending: boolean;
  markSelected: () => void;
  markEvery: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

const useSelection = () => {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error("The page's parts go inside SelectionProvider.");
  return selection;
};

/** Holds the selection. `ids` are the rows on this page. */
export const SelectionProvider = ({
  ids,
  children,
}: {
  ids: readonly string[];
  children: ReactNode;
}) => {
  const t = useTranslations("notifications.page");
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, start] = useTransition();

  const finish = (result: { changed: number } | null) => {
    if (result) {
      toast.ok(t("done.read", { count: result.changed }));
      setSelected(new Set());
      router.refresh();
    } else toast.error(t("errors.failed"));
  };

  const value: Selection = {
    selected,
    pending,
    toggle: (id) =>
      setSelected((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    selectAll: () => setSelected(new Set(ids)),
    clear: () => setSelected(new Set()),
    markSelected: () => start(async () => finish(await markRead([...selected]))),
    markEvery: () => start(async () => finish(await markAllRead())),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

/** A row's checkbox, named by the row's sentence. */
export const SelectCell = ({ id, sentence }: { id: string; sentence: string }) => {
  const t = useTranslations("notifications.page");
  const { selected, toggle } = useSelection();
  return (
    // The label carries the tap area (`touch-hit`, 44px on a coarse pointer): a checkbox can't draw
    // one itself, and a tap anywhere in it toggles the box.
    <label className="touch-hit inline-flex">
      <input
        type="checkbox"
        aria-label={t("select", { sentence })}
        checked={selected.has(id)}
        onChange={() => toggle(id)}
        className="size-4 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      />
    </label>
  );
};

/** Above the table: how many are selected, and what can be done with them. */
export const BulkBar = () => {
  const t = useTranslations("notifications.page");
  const selection = useSelection();
  const none = selection.selected.size === 0;
  return (
    <div
      role="toolbar"
      aria-label={t("bulk.label")}
      className="flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="text-muted" aria-live="polite">
        {t("bulk.selected", { count: selection.selected.size })}
      </span>
      <Button
        variant="secondary"
        disabled={none}
        loading={selection.pending}
        onClick={selection.markSelected}
      >
        {t("bulk.markSelected")}
      </Button>
      <Button variant="secondary" disabled={selection.pending} onClick={selection.markEvery}>
        {t("bulk.markAll")}
      </Button>
      <Button variant="ghost" onClick={selection.selectAll}>
        {t("bulk.selectAll")}
      </Button>
      <Button variant="ghost" disabled={none} onClick={selection.clear}>
        {t("bulk.clear")}
      </Button>
    </div>
  );
};

/**
 * A row's sentence, as a link when it leads somewhere (opening it marks the notification read, as
 * in the popover), plain text when what it is about is gone.
 */
export const OpenLink = ({
  id,
  href,
  unread,
  children,
}: {
  id: string;
  href: string | null;
  unread: boolean;
  children: ReactNode;
}) => {
  if (!href) return <>{children}</>;
  return (
    <Link
      href={href}
      onClick={() => {
        if (unread) void markRead([id]);
      }}
      className="text-fg underline-offset-2 hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {children}
    </Link>
  );
};
