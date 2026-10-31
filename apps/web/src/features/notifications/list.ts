import { defineList, type ListState } from "@/components/ui/data-table/list-query";
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/server/domains/notifications/models/notification";
import type { NotificationPageQuery } from "@/server/domains/notifications/repositories/notification-repository";

/** /notifications as a server data table (feature 139): newest first, filtered by state and kind. */
export const NOTIFICATIONS_LIST = defineList({
  path: "/notifications",
  sorts: { created: "desc" },
  defaultSort: "created",
  sizes: [25, 50, 100],
  defaultSize: 25,
  filters: { state: "string", kind: "string" },
});

export type NotificationsListState = ListState<"created", "state" | "kind">;

export const STATES = ["unread", "read"] as const;
type State = (typeof STATES)[number];

const isState = (value: string): value is State => (STATES as readonly string[]).includes(value);
const isKind = (value: string): value is NotificationKind =>
  (NOTIFICATION_KINDS as readonly string[]).includes(value);

/** The kinds grouped by what they are about (`submission`, `request`…), in the order they are listed. */
export const KIND_GROUPS: readonly { group: string; kinds: readonly NotificationKind[] }[] =
  NOTIFICATION_KINDS.reduce<{ group: string; kinds: NotificationKind[] }[]>((groups, kind) => {
    const group = kind.slice(0, kind.indexOf("."));
    const found = groups.find((entry) => entry.group === group);
    if (found) found.kinds.push(kind);
    else groups.push({ group, kinds: [kind] });
    return groups;
  }, []);

/** Drops a state or kind the page doesn't know, so the form and chips never show it. */
export const checkedNotificationsState = (
  state: NotificationsListState,
): NotificationsListState => ({
  ...state,
  filters: {
    state: isState(state.filters.state) ? state.filters.state : "",
    kind: isKind(state.filters.kind) ? state.filters.kind : "",
  },
});

/** The server query for a view (the person is added by the action). */
export const notificationsQueryOf = (
  state: NotificationsListState,
): Omit<NotificationPageQuery, "userId"> => ({
  size: state.size,
  cursor: state.cursor,
  state: isState(state.filters.state) ? state.filters.state : undefined,
  kind: isKind(state.filters.kind) ? state.filters.kind : undefined,
});
