"use server";

import {
  markAllNotificationsRead,
  markNotificationsRead,
} from "@/server/domains/notifications/actions/notifications";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";

/**
 * Marking notifications read (feature 139), from the popover and the page: the person's own only,
 * and nothing is audited. Both answer with the unread count after, so the bell can follow.
 */
export const markRead = serverAction(
  async (ids: string[]): Promise<{ unread: number; changed: number } | null> => {
    const result = await markNotificationsRead(await requestHeaders(), ids);
    return result ? { unread: result.unread, changed: result.changed.length } : null;
  },
);

export const markAllRead = serverAction(
  async (): Promise<{ unread: number; changed: number } | null> => {
    const result = await markAllNotificationsRead(await requestHeaders());
    return result ? { unread: result.unread, changed: result.changed } : null;
  },
);
