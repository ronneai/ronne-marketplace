/**
 * Notifications (feature 139): what happened, for one person. A row keeps its kind and parameters,
 * never a sentence; the sentence is the message `notifications.<kind>` in the reader's language.
 */

/** Each kind is a message path under `notifications` (`submission.approved` is nested). */
export const NOTIFICATION_KINDS = [
  // The author of a submission (014, 015, 055, 056, 058).
  "submission.approved",
  "submission.approved_override",
  "submission.changes_requested",
  "submission.rejected",
  "submission.comment",
  "submission.released",
  "submission.dependency_rejected",
  // A person who asked to join a workspace (094).
  "join_request.approved",
  "join_request.declined",
  // A person who asked to move a scope (115) or an item (134).
  "scope_move.moved",
  "scope_move.declined",
  "item_move.moved",
  "item_move.declined",
  // A member (092).
  "membership.added",
  "membership.removed",
  "membership.role_changed",
  // The people who answer requests (094, 115, 134): one per request.
  "request.join_waiting",
  "request.scope_move_waiting",
  "request.item_move_waiting",
  // Root (127; 140 adds `update.available`).
  "feedback.new",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const isNotificationKind = (value: string): value is NotificationKind =>
  (NOTIFICATION_KINDS as readonly string[]).includes(value);

/** What a notification is about, so its link and its visibility check can be built from it. */
export const SUBJECT_TYPES = [
  "submission",
  "workspace",
  "join_request",
  "scope_move",
  "item_move",
  "feedback",
] as const;

export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const isSubjectType = (value: string): value is SubjectType =>
  (SUBJECT_TYPES as readonly string[]).includes(value);

/** Ids and the names as they were then: small, flat, never a secret or a message body. */
export type NotificationParams = Record<string, string | number | boolean | null>;

/** A notification's parameters are at most this many bytes of JSON. */
export const MAX_PARAMS_BYTES = 2048;

export type NewNotification = {
  /** User ids; the actor, duplicates and disabled or erased users are left out. */
  recipients: readonly string[];
  kind: NotificationKind;
  /** Who did it; never notified. Null for something the system did. */
  actorId: string | null;
  subject: { type: SubjectType; id: string };
  params?: NotificationParams;
};

export type Notification = {
  id: string;
  kind: NotificationKind;
  actorId: string | null;
  subject: { type: SubjectType; id: string };
  params: NotificationParams;
  createdAt: Date;
  readAt: Date | null;
};

/** The unread count stops here, shown as "99+". */
export const UNREAD_CAP = 100;

/** Notifications are kept this many days, read or not (102 purges them). */
export const RETENTION_DAYS = 90;

/**
 * The parameters as JSON text, or an error for a bug: parameters over the size limit, or a value
 * that isn't a string, number, boolean or null.
 */
export const encodeParams = (params: NotificationParams | undefined): string => {
  const value = params ?? {};
  for (const [key, entry] of Object.entries(value))
    if (
      entry !== null &&
      typeof entry !== "string" &&
      typeof entry !== "number" &&
      typeof entry !== "boolean"
    )
      throw new Error(`Notification parameter "${key}" must be a string, number, boolean or null.`);
  for (const [key, entry] of Object.entries(value))
    if (typeof entry === "number" && !Number.isFinite(entry))
      throw new Error(`Notification parameter "${key}" must be a finite number.`);
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text, "utf8") > MAX_PARAMS_BYTES)
    throw new Error(`Notification parameters are over ${MAX_PARAMS_BYTES} bytes.`);
  return text;
};

/** The parameters read back; anything unreadable is an empty set, never an error on a page. */
export const decodeParams = (text: string): NotificationParams => {
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
    const out: NotificationParams = {};
    for (const [key, entry] of Object.entries(value))
      if (
        entry === null ||
        typeof entry === "string" ||
        typeof entry === "number" ||
        typeof entry === "boolean"
      )
        out[key] = entry;
    return out;
  } catch {
    return {};
  }
};
