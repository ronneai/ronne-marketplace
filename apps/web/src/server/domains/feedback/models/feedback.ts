/**
 * Feedback to the instance's administrators (feature 127): what a person may send, and the rules
 * that keep it small and safe. Pure: the service and the repository build on it.
 */
export const FEEDBACK_KINDS = ["problem", "idea", "question", "praise"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_STATUSES = ["new", "handled"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const FEEDBACK_MESSAGE_MAX = 4000;
export const FEEDBACK_PAGE_MAX = 200;
/** Messages one person may send in an hour (037's limiter), so a stuck button can't flood Admin. */
export const FEEDBACK_PER_HOUR = 10;
export const FEEDBACK_WINDOW_MS = 60 * 60_000;

export const isFeedbackKind = (value: unknown): value is FeedbackKind =>
  typeof value === "string" && (FEEDBACK_KINDS as readonly string[]).includes(value);

export const isFeedbackStatus = (value: unknown): value is FeedbackStatus =>
  typeof value === "string" && (FEEDBACK_STATUSES as readonly string[]).includes(value);

/** What the form sends. */
export type FeedbackInput = { kind: unknown; message: unknown; page?: unknown };

/** Why a message was refused: the words are the screen's (`feedback.errors.<code>`). */
export type FeedbackProblem = "kind_required" | "message_required" | "message_too_long";

export type CheckedFeedback = {
  kind: FeedbackKind;
  /** As written, only with the line ends made `\n`. */
  message: string;
  /** The path they were on, or null. */
  page: string | null;
};

// C0 and C1 controls except tab and newline.
// biome-ignore lint/suspicious/noControlCharactersInRegex: removing them is the point
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Characters that show nothing: a message of only these is empty.
const INVISIBLE = /[\u200B-\u200F\u2060\u2061-\u2064\uFEFF\u00AD]/g;

/**
 * The first part of every page a signed-in person can be on (`/` and these). A test keeps it equal
 * to the folders of `app/(app)` that hold a page, and `feedback` is this feature's own.
 */
export const PAGE_ROOTS = [
  "account",
  "admin",
  "catalogue",
  "device",
  "feedback",
  "items",
  "menu",
  "reviews",
  "styleguide",
  "submissions",
  "workspaces",
] as const;

// A path as the app's routes write it: letters, digits and the marks of a URL path, no query.
const PATH = /^\/[A-Za-z0-9._~%@+/-]*$/;

/**
 * The path part of a page address, or null. Only the path is kept: whatever follows `?` or `#`
 * could hold a link's secrets, so it is cut off before anything else is looked at. Anything that
 * is not a path of this app (another site, `//host`, odd characters, over 200 characters, `..`, a
 * first part that is no page of the app) is dropped rather than shortened.
 */
export const pagePathOf = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const path = value.split(/[?#]/, 1)[0] ?? "";
  if (path.length === 0 || path.length > FEEDBACK_PAGE_MAX) return null;
  if (!PATH.test(path) || path.startsWith("//") || path.split("/").includes("..")) return null;
  const root = /^\/([^/]*)/.exec(path)?.[1] ?? "";
  return root === "" || (PAGE_ROOTS as readonly string[]).includes(root) ? path : null;
};

/**
 * Checks what the form sent. A message of only spaces is refused, and one over the limit is
 * refused, never cut. The page is optional and silently dropped when it isn't a path.
 */
export const checkFeedback = (
  input: FeedbackInput,
): { ok: true; feedback: CheckedFeedback } | { ok: false; problem: FeedbackProblem } => {
  if (!isFeedbackKind(input.kind)) return { ok: false, problem: "kind_required" };
  // Line ends made `\n`; control characters out (PostgreSQL can't hold a NUL, and none is writing).
  const message =
    typeof input.message === "string"
      ? input.message.replace(/\r\n?/g, "\n").replace(CONTROL, "")
      : "";
  if (message.replace(INVISIBLE, "").trim().length === 0)
    return { ok: false, problem: "message_required" };
  if ([...message].length > FEEDBACK_MESSAGE_MAX) return { ok: false, problem: "message_too_long" };
  return {
    ok: true,
    feedback: { kind: input.kind, message, page: pagePathOf(input.page) },
  };
};

/** A row of the inbox. */
export type FeedbackEntry = {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string | null;
  version: string;
  status: FeedbackStatus;
  createdAt: Date;
  handledAt: Date | null;
  /** Who marked it handled, when they still exist. */
  handledBy: string | null;
  sender: { id: string; name: string; email: string };
};
