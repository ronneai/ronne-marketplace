/**
 * The instance notice (feature 124): one short message root shows under the header of every
 * signed-in page, such as a maintenance window or "this is a demo". It is root's own text, so it is
 * not translated, and it is only ever output as text.
 */
export const NOTICE_TONES = ["info", "warning"] as const;
export type NoticeTone = (typeof NOTICE_TONES)[number];

export const isNoticeTone = (value: unknown): value is NoticeTone =>
  typeof value === "string" && (NOTICE_TONES as readonly string[]).includes(value);

export const NOTICE_MESSAGE_MAX = 500;
export const NOTICE_LINK_LABEL_MAX = 60;
export const NOTICE_LINK_HREF_MAX = 2000;

export type Notice = {
  message: string;
  /** Both or neither: a label with the address it opens. */
  link: { label: string; href: string } | null;
  tone: NoticeTone;
  shown: boolean;
  /** Raised when the message, link or tone changes; the dismiss cookie holds the one dismissed. */
  revision: number;
};

/** The setting's key in `instance_settings`; the value is the notice as JSON. */
export const NOTICE_KEY = "notice";

export const DEFAULT_NOTICE: Notice = {
  message: "",
  link: null,
  tone: "info",
  shown: false,
  revision: 0,
};

/** What root types in the form. */
export type NoticeInput = {
  message: unknown;
  linkLabel: unknown;
  linkHref: unknown;
  tone: unknown;
  shown: unknown;
};

export type NoticeField = "message" | "linkLabel" | "linkHref" | "tone";
export type NoticeProblem = "empty" | "too_long" | "link_incomplete" | "link_address" | "tone";

/** A refusal: which field, and why. The page shows a message beside the field. */
export type NoticeRefusal = { field: NoticeField; problem: NoticeProblem };

// No line break, tab or other control character (U+2028 and U+2029 count as line breaks), and no
// bidi override that could reorder the words around it: the notice is one line of plain text.
// The zero-width joiners emoji need stay allowed.
const CONTROL = /[\p{Cc}\p{Zl}\p{Zp}\u202A-\u202E\u2066-\u2069]/u;
// An address also refuses every invisible format character.
const HIDDEN = /\p{Cf}/u;

const textOf = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const lengthOf = (text: string) => [...text].length;

/**
 * An address a link may open: `https:` with a host, or a path on this site that starts with a
 * single `/` (`//host` would leave the site). `javascript:`, `data:` and the rest are refused.
 */
export const isNoticeHref = (href: string): boolean => {
  if (
    href.length > NOTICE_LINK_HREF_MAX ||
    CONTROL.test(href) ||
    HIDDEN.test(href) ||
    /\s/.test(href)
  )
    return false;
  if (href.startsWith("/")) return !href.startsWith("//") && !href.includes("\\");
  if (!href.startsWith("https://")) return false;
  try {
    const url = new URL(href);
    // A name and password in the address (https://bank.com@evil.example) is how links lie.
    return url.protocol === "https:" && url.hostname !== "" && !url.username && !url.password;
  } catch {
    return false;
  }
};

/** The checked form input as a notice without its revision, or the first thing wrong with it. */
export const noticeFrom = (
  input: NoticeInput,
): { ok: true; notice: Omit<Notice, "revision"> } | { ok: false; refusal: NoticeRefusal } => {
  const message = textOf(input.message);
  const label = textOf(input.linkLabel);
  const href = textOf(input.linkHref);
  const shown = input.shown === true || input.shown === "true" || input.shown === "on";
  if (!isNoticeTone(input.tone)) return { ok: false, refusal: { field: "tone", problem: "tone" } };
  if (CONTROL.test(message) || lengthOf(message) > NOTICE_MESSAGE_MAX)
    return { ok: false, refusal: { field: "message", problem: "too_long" } };
  // An empty message can be saved (the text is kept for later) but can't be shown.
  if (shown && message === "")
    return { ok: false, refusal: { field: "message", problem: "empty" } };
  if (label === "" && href === "")
    return { ok: true, notice: { message, link: null, tone: input.tone, shown } };
  if (label === "")
    return { ok: false, refusal: { field: "linkLabel", problem: "link_incomplete" } };
  if (CONTROL.test(label) || lengthOf(label) > NOTICE_LINK_LABEL_MAX)
    return { ok: false, refusal: { field: "linkLabel", problem: "too_long" } };
  if (href === "") return { ok: false, refusal: { field: "linkHref", problem: "link_incomplete" } };
  if (!isNoticeHref(href))
    return { ok: false, refusal: { field: "linkHref", problem: "link_address" } };
  return { ok: true, notice: { message, link: { label, href }, tone: input.tone, shown } };
};

const sameLink = (a: Notice["link"], b: Notice["link"]) =>
  a === b || (a !== null && b !== null && a.label === b.label && a.href === b.href);

/** Whether the words, link or tone differ: what makes people who dismissed it see it again. */
export const noticeContentChanged = (from: Notice, to: Omit<Notice, "revision">): boolean =>
  from.message !== to.message || from.tone !== to.tone || !sameLink(from.link, to.link);

/** A stored notice read back, or null when it isn't one (a hand edit): the caller uses the default. */
export const noticeFromStored = (value: string): Notice | null => {
  try {
    const raw: unknown = JSON.parse(value);
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.message !== "string" || !isNoticeTone(r.tone) || typeof r.shown !== "boolean")
      return null;
    if (typeof r.revision !== "number" || !Number.isInteger(r.revision) || r.revision < 0)
      return null;
    const link = r.link as Record<string, unknown> | null | undefined;
    const valid =
      link &&
      typeof link.label === "string" &&
      typeof link.href === "string" &&
      isNoticeHref(link.href)
        ? { label: link.label, href: link.href }
        : null;
    return { message: r.message, link: valid, tone: r.tone, shown: r.shown, revision: r.revision };
  } catch {
    return null;
  }
};
