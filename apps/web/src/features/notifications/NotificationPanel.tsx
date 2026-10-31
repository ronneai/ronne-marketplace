"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { LocalTime } from "@/components/ui/LocalTime";
import type { NotificationView } from "@/server/domains/notifications/services/read";
import { markAllRead, markRead } from "./actions";
import { notificationHref } from "./href";
import { iconOf, tileClass } from "./kind-style";
import { renderSentence } from "./sentence";

/** A notification as the latest-ten route sends it: dates are text. */
export type NotificationItem = Omit<NotificationView, "createdAt" | "readAt"> & {
  createdAt: string;
  readAt: string | null;
};

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: NotificationItem[] };

const focus = "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/**
 * What the bell opens (139): the ten latest notifications the person sees, a header with the unread
 * count and "Mark all as read", and a link to all of them. Loaded when it opens, so it is always
 * fresh. A row is one link: opening it marks it read. Flat, bordered, tokens only; the tile's icon
 * says the kind, red only where something went against the person's work.
 */
export const NotificationPanel = ({
  unread,
  onUnread,
  onNavigate,
  heading = true,
}: {
  /** The bell's count: the header's pill follows it. */
  unread: number;
  onUnread: (count: number) => void;
  /** Called when a link is followed or "See all" is, so the surface around can close. */
  onNavigate?: () => void;
  /** Off where a dialog already carries the title, as on a phone. */
  heading?: boolean;
}) => {
  const t = useTranslations("notifications");
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/notifications/latest", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { unread: number; items: NotificationItem[] };
      setState({ status: "ready", items: body.items });
      onUnread(body.unread);
    } catch {
      setState({ status: "error" });
    }
  }, [onUnread]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loads once, when it opens.
  useEffect(() => {
    void load();
  }, []);

  const markOne = (id: string) => {
    void markRead([id]).then((result) => {
      if (result) onUnread(result.unread);
    });
    setState((s) =>
      s.status === "ready"
        ? {
            ...s,
            items: s.items.map((i) => (i.id === id ? { ...i, readAt: i.readAt ?? "now" } : i)),
          }
        : s,
    );
  };

  const markAll = async () => {
    setBusy(true);
    try {
      const result = await markAllRead();
      if (result) onUnread(result.unread);
      setState((s) =>
        s.status === "ready"
          ? { ...s, items: s.items.map((i) => ({ ...i, readAt: i.readAt ?? "now" })) }
          : s,
      );
    } finally {
      setBusy(false);
    }
  };

  const sentenceOf = (item: NotificationItem) =>
    renderSentence(
      (key, values) => (t as unknown as (k: string, v: typeof values) => string)(key, values),
      item,
      t("system"),
      t("fallback"),
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm font-normal">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          {heading ? <h2 className="type-card-title text-fg">{t("ui.title")}</h2> : null}
          {unread > 0 ? (
            <span className="rounded-full bg-accent-strong px-2 py-0.5 text-xs font-semibold text-on-accent">
              {t("ui.unread", { count: unread })}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy || unread === 0}
          onClick={markAll}
          className={`touch-hit rounded-control px-2 py-1 text-xs text-muted hover:bg-tint hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${focus}`}
        >
          {t("ui.markAll")}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "loading" ? (
          <p role="status" className="px-4 py-6 text-center text-muted">
            {t("ui.loading")}
          </p>
        ) : state.status === "error" ? (
          <div role="alert" className="grid justify-items-center gap-2 px-4 py-6 text-center">
            <p className="text-error-text">{t("ui.error")}</p>
            <button
              type="button"
              onClick={() => void load()}
              className={`touch-hit rounded-control border border-hairline px-3 py-1 text-fg hover:bg-tint ${focus}`}
            >
              {t("ui.retry")}
            </button>
          </div>
        ) : state.items.length === 0 ? (
          <p className="px-4 py-6 text-center text-muted">{t("ui.empty")}</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {state.items.map((item) => {
              const Icon = iconOf(item.kind);
              const isUnread = item.readAt === null;
              const body = (
                <>
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-control ${tileClass(item.kind)}`}
                    aria-hidden
                  >
                    <Icon size={16} />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className={`text-fg ${isUnread ? "font-semibold" : "text-muted"}`}>
                      {sentenceOf(item)}
                    </span>
                    <LocalTime value={item.createdAt} className="type-meta text-muted" />
                  </span>
                  {isUnread ? (
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                      role="img"
                      aria-label={t("ui.unreadMark")}
                    />
                  ) : null}
                </>
              );
              const row = "flex items-start gap-3 px-4 py-3";
              return (
                <li key={item.id}>
                  {item.link ? (
                    <Link
                      href={notificationHref(item.link)}
                      onClick={() => {
                        if (isUnread) markOne(item.id);
                        onNavigate?.();
                      }}
                      className={`${row} hover:bg-tint ${focus}`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={row}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-hairline px-4 py-2">
        <Link
          href="/notifications"
          onClick={onNavigate}
          className={`touch-hit inline-block rounded-control px-2 py-1 text-fg underline hover:bg-tint ${focus}`}
        >
          {t("ui.seeAll")}
        </Link>
      </div>
    </div>
  );
};
