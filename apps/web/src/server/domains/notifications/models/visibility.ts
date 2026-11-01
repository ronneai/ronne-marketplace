import type { Viewer } from "../../workspaces/models/viewer";
import { seesWorkspace } from "../../workspaces/models/viewer";
import type { NotificationKind } from "./notification";

/** What the app can open for a notification: the web turns each into an address. */
export type NotificationLink =
  | { to: "submission"; id: string }
  | { to: "workspace"; name: string }
  | { to: "workspaces" }
  | { to: "requests" }
  | { to: "item"; workspace: string; scope: string; name: string }
  | { to: "feedback" };

/** What a notification's subject turned out to be, read from the database (never stored). */
export type ResolvedSubject = {
  /** The workspaces the subject lives in, current ids; empty when it has none left. */
  workspaceIds: readonly string[];
  /** Where it leads, whoever may open it. */
  link: NotificationLink | null;
};

/**
 * Kinds that tell a person they lost, or never had, a way in: they are shown whatever the person
 * still sees, with a link only when they see the workspace (139). Their point is the workspace's
 * name, which the person knew.
 */
const ABOUT_ACCESS: ReadonlySet<NotificationKind> = new Set([
  "membership.removed",
  "join_request.declined",
]);

export type Shown = { shown: false } | { shown: true; link: NotificationLink | null };

/**
 * Whether the reader may still see what a notification is about (139), and where it leads. Hidden:
 * the subject lives in a workspace the reader no longer sees (someone removed from a private
 * workspace stops seeing the names of its items in old notifications), and feedback for anyone
 * but root. Shown without a link: the subject is gone (a draft deleted for good, 057), or the
 * notification is about losing access.
 */
export const shownTo = (
  viewer: Viewer,
  kind: NotificationKind,
  subject: ResolvedSubject | null,
): Shown => {
  if (kind === "feedback.new")
    return viewer.root ? { shown: true, link: subject?.link ?? null } : { shown: false };
  if (!subject) return { shown: true, link: null };
  const sees =
    subject.workspaceIds.length === 0 ||
    subject.workspaceIds.some((id) => seesWorkspace(viewer, id));
  if (ABOUT_ACCESS.has(kind)) {
    // A decline leads to the list of workspaces, whatever else the person sees.
    if (kind === "join_request.declined") return { shown: true, link: { to: "workspaces" } };
    return { shown: true, link: sees ? subject.link : null };
  }
  return sees ? { shown: true, link: subject.link } : { shown: false };
};
