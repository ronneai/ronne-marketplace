/**
 * Which notice revision a person dismissed (feature 124), kept in a cookie so the server decides
 * whether to draw it. The cookie holds the revision number; a notice comes back when root changes
 * its words, link or tone, because that raises the revision above the one the cookie holds. A
 * cookie is per browser, so dismissing here doesn't dismiss on another device.
 */
export const NOTICE_COOKIE = "ronne-notice";

/** The cookie's options: a year, the whole site, not readable by scripts (only the server uses it). */
export const noticeCookieOptions = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  httpOnly: true,
};

/** A revision as the cookie or the form holds it: digits only, at most nine; anything else is null. */
export const parseRevision = (value: unknown): number | null =>
  typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : null;

/** Whether the cookie's revision covers this notice. Garbage or no cookie dismisses nothing. */
export const isDismissed = (revision: number, cookie: string | undefined): boolean => {
  const dismissed = parseRevision(cookie);
  return dismissed !== null && dismissed >= revision;
};
