/** Whether the sidebar is folded into its rail (119), kept in a cookie so the server renders it. */
export const SIDEBAR_COOKIE = "ronne-sidebar";

/** Anything but `folded`, a missing cookie included, means unfolded. */
export const parseFolded = (value: string | undefined): boolean => value === "folded";

/** The cookie as `document.cookie` sets it: a year, the whole site. */
export const sidebarCookie = (folded: boolean) =>
  `${SIDEBAR_COOKIE}=${folded ? "folded" : "open"}; path=/; max-age=31536000; samesite=lax`;
