"use client";

import { useSyncExternalStore } from "react";
import type { NavGroup } from "./nav";
import { navGroupsCookie, navGroupsFrom, parseClosedGroups, withGroup } from "./nav-groups-cookie";

/**
 * The navigation's open and closed groups (166), one store for the whole page: the cookie. The
 * sidebar and the Menu (mounted together from the first render, the Menu inside its closed sheet)
 * read it through `useSyncExternalStore`, so a group closed in one is closed in the other at once,
 * and a change made in another tab shows at the next render.
 */
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// The same array while the cookie says the same, as `useSyncExternalStore` needs.
let lastValue: string | undefined;
let lastClosed: readonly NavGroup[] = [];
const snapshot = (): readonly NavGroup[] => {
  const value = navGroupsFrom(document.cookie) ?? "";
  if (value !== lastValue) {
    lastValue = value;
    lastClosed = parseClosedGroups(value);
  }
  return lastClosed;
};

/** Opens or closes a group, written over what the cookie says now (another tab's choice kept). */
const setOpen = (id: NavGroup, open: boolean) => {
  const now = snapshot();
  // Written unless the cookie says so already (another tab did it). Either way the page is drawn
  // again from the cookie, which now says what the click asked for: else the click did nothing.
  if (now.includes(id) === open) {
    // biome-ignore lint/suspicious/noDocumentCookie: one plain preference, read by the server.
    document.cookie = navGroupsCookie(withGroup(now, id, open));
  }
  for (const listener of listeners) listener();
};

/** The groups as the page shows them; `initial` is the cookie the server read, for its render. */
export const useNavGroups = (initial: readonly NavGroup[]) => {
  const closed = useSyncExternalStore(subscribe, snapshot, () => initial);
  return {
    isClosed: (id: NavGroup) => closed.includes(id),
    /** A click on its heading: closed opens, open closes. */
    toggle: (id: NavGroup) => setOpen(id, closed.includes(id)),
  };
};
