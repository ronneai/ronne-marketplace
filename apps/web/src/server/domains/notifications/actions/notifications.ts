import { getCurrentUser } from "../../identity/actions/session";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import { kyselyNotificationRepository } from "../repositories/kysely-notification-repository";
import type { NotificationFilters } from "../repositories/notification-repository";
import {
  countVisible,
  countVisibleUnread,
  latestVisible,
  type NotificationView,
  pageVisible,
} from "../services/read";

/** What the popover lists. */
export const POPOVER_SIZE = 10;

/** The most ids one call marks read: a page's worth. */
const MAX_IDS = 100;

/**
 * The notification center's reading and marking (feature 139). Thin: the person is the session's
 * (a signed-out request gets `null`), what they see is judged by `read.ts`, and nobody reads or
 * marks anyone else's.
 */
const reader = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  return user ? { user, viewer: await viewerOf(user, app) } : null;
};

/** How many unread notifications the person sees; `null` when nobody is signed in. */
export const unreadCount = async (
  headers: Headers,
  app: AppAuth = getAppAuth(),
): Promise<number | null> => {
  const who = await reader(headers, app);
  return who ? countVisibleUnread(app.db, app.dialect, who.viewer, who.user.id) : null;
};

/** The latest ten, and the unread count; `null` when nobody is signed in. */
export const latestNotifications = async (
  headers: Headers,
  app: AppAuth = getAppAuth(),
): Promise<{ unread: number; items: NotificationView[] } | null> => {
  const who = await reader(headers, app);
  if (!who) return null;
  const [items, unread] = await Promise.all([
    latestVisible(app.db, app.dialect, who.viewer, who.user.id, POPOVER_SIZE),
    countVisibleUnread(app.db, app.dialect, who.viewer, who.user.id),
  ]);
  return { items, unread };
};

/** One page of the person's notifications (the `/notifications` page). */
export const pageNotifications = async (
  headers: Headers,
  query: Omit<Parameters<typeof pageVisible>[3], "userId">,
  app: AppAuth = getAppAuth(),
) => {
  const who = await reader(headers, app);
  return who
    ? pageVisible(app.db, app.dialect, who.viewer, { ...query, userId: who.user.id })
    : null;
};

/** How many notifications the person sees under these filters (the page's total). */
export const countNotifications = async (
  headers: Headers,
  filters: NotificationFilters,
  app: AppAuth = getAppAuth(),
) => {
  const who = await reader(headers, app);
  return who
    ? countVisible(app.db, app.dialect, who.viewer, { ...filters, userId: who.user.id })
    : null;
};

/**
 * Marks some of the person's own notifications read (opening one, or "Mark as read"); returns the
 * ids that changed, and the unread count after. Ids that aren't theirs, or are read already, do
 * nothing. `null` when nobody is signed in.
 */
export const markNotificationsRead = async (
  headers: Headers,
  ids: readonly string[],
  app: AppAuth = getAppAuth(),
): Promise<{ changed: string[]; unread: number } | null> => {
  const who = await reader(headers, app);
  if (!who) return null;
  const wanted = [...new Set(ids)].filter((id) => typeof id === "string" && id.length <= 64);
  const changed = await kyselyNotificationRepository(app.db, app.dialect).markRead(
    who.user.id,
    wanted.slice(0, MAX_IDS),
    new Date(),
  );
  return {
    changed,
    unread: await countVisibleUnread(app.db, app.dialect, who.viewer, who.user.id),
  };
};

/** Marks all of the person's unread notifications read ("Mark all as read"); returns how many. */
export const markAllNotificationsRead = async (
  headers: Headers,
  app: AppAuth = getAppAuth(),
): Promise<{ changed: number; unread: number } | null> => {
  const who = await reader(headers, app);
  if (!who) return null;
  const changed = await kyselyNotificationRepository(app.db, app.dialect).markAllRead(
    who.user.id,
    new Date(),
  );
  return {
    changed,
    unread: await countVisibleUnread(app.db, app.dialect, who.viewer, who.user.id),
  };
};
