import { defineList, type ListState, listValues } from "@/components/ui/data-table/list-query";
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
  filters: { state: "list", kind: "list" },
});

export type NotificationsListState = ListState<"created", "state" | "kind">;

export const STATES = ["unread", "read"] as const;

/** The kinds grouped by what they are about (`submission`, `request`…), in the order they are listed. */
export const KIND_GROUPS: readonly { group: string; kinds: readonly NotificationKind[] }[] =
  NOTIFICATION_KINDS.reduce<{ group: string; kinds: NotificationKind[] }[]>((groups, kind) => {
    const group = kind.slice(0, kind.indexOf("."));
    const found = groups.find((entry) => entry.group === group);
    if (found) found.kinds.push(kind);
    else groups.push({ group, kinds: [kind] });
    return groups;
  }, []);

/** The values of a `list` filter the page knows, in the order of `known`, each once. */
const known = <T extends string>(value: string, all: readonly T[]): T[] => {
  const asked = new Set(listValues(value));
  return all.filter((v) => asked.has(v));
};

/**
 * Keeps the states and kinds the page knows, in their own order, so the popovers and the address
 * never show one it doesn't. Choosing every state, or every kind, is the same as choosing none.
 */
export const checkedNotificationsState = (
  state: NotificationsListState,
): NotificationsListState => {
  const states = known(state.filters.state, STATES);
  const kinds = known(state.filters.kind, NOTIFICATION_KINDS);
  return {
    ...state,
    filters: {
      state: states.length === STATES.length ? "" : states.join(","),
      kind: kinds.length === NOTIFICATION_KINDS.length ? "" : kinds.join(","),
    },
  };
};

/** The server query for a view (the person is added by the action). */
export const notificationsQueryOf = (
  state: NotificationsListState,
): Omit<NotificationPageQuery, "userId"> => {
  const states = known(state.filters.state, STATES);
  const kinds = known(state.filters.kind, NOTIFICATION_KINDS);
  return {
    size: state.size,
    cursor: state.cursor,
    // Both states are every notification.
    state: states.length === 1 ? states[0] : undefined,
    kinds: kinds.length > 0 && kinds.length < NOTIFICATION_KINDS.length ? kinds : undefined,
  };
};
