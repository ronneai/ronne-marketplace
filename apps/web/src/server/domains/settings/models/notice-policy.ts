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
/** Links one message may hold: it is one short line. */
export const NOTICE_LINKS_MAX = 3;

export type Notice = {
  /** Root's words, with links written inline as `[label](address)`. */
  message: string;
  tone: NoticeTone;
  shown: boolean;
  /** Raised when the message or tone changes; the dismiss cookie holds the one dismissed. */
  revision: number;
};

/** The setting's key in `instance_settings`; the value is the notice as JSON. */
export const NOTICE_KEY = "notice";

export const DEFAULT_NOTICE: Notice = {
  message: "",
  tone: "info",
  shown: false,
  revision: 0,
};

/** What root types in the form. */
export type NoticeInput = {
  message: unknown;
  tone: unknown;
  shown: unknown;
};

export type NoticeField = "message" | "tone";
export type NoticeProblem =
  | "empty"
  | "too_long"
  | "link_label"
  | "link_address"
  | "too_many_links"
  | "tone";

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

/** A link written inline: `[label](address)`. Anything else with brackets stays plain text. */
const LINK = /\[([^[\]]{0,500})\]\(([^()]{0,2000})\)/g;

/** A piece of the message: plain words, or a link with its label and address. */
export type NoticePart = { text: string } | { label: string; href: string };

/**
 * The message as the pieces to draw (124): plain text and links, in order. A link counts only with
 * a label of 1 to 60 characters, an address `isNoticeHref` allows, and while there are fewer than
 * `NOTICE_LINKS_MAX` before it; any other `[x](y)` is drawn as the words it is. The pieces are
 * output as text and `<a>` elements by the caller, never as HTML.
 */
export const noticeParts = (message: string): NoticePart[] => {
  const parts: NoticePart[] = [];
  let last = 0;
  let links = 0;
  const plain = (text: string) => {
    if (text === "") return;
    const before = parts.at(-1);
    if (before && "text" in before) before.text += text;
    else parts.push({ text });
  };
  for (const match of message.matchAll(LINK)) {
    const label = (match[1] ?? "").trim();
    const href = match[2] ?? "";
    plain(message.slice(last, match.index));
    last = match.index + match[0].length;
    if (
      links < NOTICE_LINKS_MAX &&
      label !== "" &&
      lengthOf(label) <= NOTICE_LINK_LABEL_MAX &&
      isNoticeHref(href)
    ) {
      parts.push({ label, href });
      links += 1;
    } else plain(match[0]);
  }
  plain(message.slice(last));
  return parts;
};

/** The words without the link syntax (`[label](address)` becomes `label`), for counting what is seen. */
export const noticePlainText = (message: string): string =>
  noticeParts(message)
    .map((part) => ("text" in part ? part.text : part.label))
    .join("");

/** The checked form input as a notice without its revision, or the first thing wrong with it. */
export const noticeFrom = (
  input: NoticeInput,
): { ok: true; notice: Omit<Notice, "revision"> } | { ok: false; refusal: NoticeRefusal } => {
  const message = textOf(input.message);
  const shown = input.shown === true || input.shown === "true" || input.shown === "on";
  if (!isNoticeTone(input.tone)) return { ok: false, refusal: { field: "tone", problem: "tone" } };
  if (CONTROL.test(message) || lengthOf(message) > NOTICE_MESSAGE_MAX)
    return { ok: false, refusal: { field: "message", problem: "too_long" } };
  // An empty message can be saved (the text is kept for later) but can't be shown.
  if (shown && message === "")
    return { ok: false, refusal: { field: "message", problem: "empty" } };
  const links = [...message.matchAll(LINK)];
  for (const match of links) {
    const label = (match[1] ?? "").trim();
    if (label === "" || lengthOf(label) > NOTICE_LINK_LABEL_MAX)
      return { ok: false, refusal: { field: "message", problem: "link_label" } };
    if (!isNoticeHref(match[2] ?? ""))
      return { ok: false, refusal: { field: "message", problem: "link_address" } };
  }
  if (links.length > NOTICE_LINKS_MAX)
    return { ok: false, refusal: { field: "message", problem: "too_many_links" } };
  return { ok: true, notice: { message, tone: input.tone, shown } };
};

/** Whether the words or tone differ: what makes people who dismissed it see it again. */
export const noticeContentChanged = (from: Notice, to: Omit<Notice, "revision">): boolean =>
  from.message !== to.message || from.tone !== to.tone;

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
    return { message: r.message, tone: r.tone, shown: r.shown, revision: r.revision };
  } catch {
    return null;
  }
};
