import { NAV_GROUPS, type NavGroup } from "./nav";

/**
 * Which of the navigation's groups are closed (166), kept in a cookie so the server renders the
 * next page the same, as the fold is (119). The sidebar and the phone's Menu share it.
 */
export const NAV_GROUPS_COOKIE = "ronne-nav-groups";

const IDS: readonly string[] = NAV_GROUPS.map((group) => group.id);

/** The closed groups the value names, in the groups' order; anything else is ignored. */
export const parseClosedGroups = (value: string | undefined): NavGroup[] => {
  const named = new Set((value ?? "").split("."));
  return NAV_GROUPS.map((group) => group.id).filter((id) => named.has(id) && IDS.includes(id));
};

/** The cookie as `document.cookie` sets it: a year, the whole site. Open at first: none closed. */
export const navGroupsCookie = (closed: readonly NavGroup[]) =>
  `${NAV_GROUPS_COOKIE}=${parseClosedGroups(closed.join(".")).join(".")}; path=/; max-age=31536000; samesite=lax`;

/** The cookie's value in a `document.cookie` string, or undefined. */
export const navGroupsFrom = (cookies: string): string | undefined =>
  cookies
    .split(";")
    .map((pair) => pair.trim())
    .find((pair) => pair.startsWith(`${NAV_GROUPS_COOKIE}=`))
    ?.slice(NAV_GROUPS_COOKIE.length + 1);

/** The closed groups after one is opened or closed, from what the cookie says now. */
export const withGroup = (closed: readonly NavGroup[], id: NavGroup, open: boolean): NavGroup[] =>
  parseClosedGroups([...closed.filter((group) => group !== id), ...(open ? [] : [id])].join("."));
