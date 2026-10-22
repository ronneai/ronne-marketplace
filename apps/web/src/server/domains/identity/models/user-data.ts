import type { AuditMetadata, AuditMetadataValue } from "../../audit/models/audit-event";
import type { Locale } from "./locale";

/**
 * The file a person can download about themselves (feature 104): `version: 1`. Dates become ISO
 * 8601 UTC in the JSON. Secrets are never in it: the repository doesn't select them.
 */
export const USER_DATA_VERSION = 1;
/** Most rows in any list; past it the list is cut, oldest kept, and `truncated` names it. */
export const USER_DATA_MAX_ROWS = 10_000;
/** A comment's body is cut at this many characters, with `…`. */
export const USER_DATA_COMMENT_MAX = 10_000;
/** One download per account per this long. */
export const USER_DATA_WINDOW_MS = 10 * 60 * 1000;
export const USER_DATA_INSTANCE_NAME = "Ronne AI Marketplace";

export type UserDataSection =
  | "sessions"
  | "accessTokens"
  | "deviceGrants"
  | "workspaces"
  | "accessRequests"
  | "scopes"
  | "favorites"
  | "feedback"
  | "items"
  | "submissions"
  | "comments"
  | "auditEvents";

export type UserDataSignInMethod = "password" | { provider: string; linkedAt: Date };

export type UserDataAccount = {
  id: string;
  name: string;
  email: string;
  role: "root" | "user";
  createdAt: Date;
  disabledAt: Date | null;
  twoFactorEnabled: boolean;
  /** The language they chose (129); null is automatic. */
  locale: Locale | null;
  signInMethods: UserDataSignInMethod[];
  scim: { provider: string; externalId: string | null; active: boolean } | null;
};

export type UserDataSession = {
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export type UserDataAccessToken = {
  name: string;
  prefix: string | null;
  createdAt: Date;
  createdVia: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
};

export type UserDataDeviceGrant = {
  name: string;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
};

export type UserDataWorkspace = {
  name: string;
  role: "admin" | "moderator" | "user";
  since: Date;
  source: string | null;
};

export type UserDataAccessRequest = {
  workspace: string;
  status: string;
  message: string | null;
  createdAt: Date;
};

/** An item the person favorited (125), by its full name now, whether or not it shows today. */
export type UserDataFavorite = { item: string; addedAt: Date };

/**
 * A message the person sent with Send feedback (127), as written: plain text. Whether root marked
 * it handled, and when, is theirs to know too.
 */
export type UserDataFeedback = {
  kind: string;
  message: string;
  /** The path of the page they were on, when they included it. */
  page: string | null;
  version: string;
  status: string;
  sentAt: Date;
  handledAt: Date | null;
};

/** The Getting started checklist's state (126); null when they never touched it. */
export type UserDataOnboarding = {
  hiddenAt: Date | null;
  installConfirmedAt: Date | null;
  completedSeenAt: Date | null;
} | null;

export type UserDataScope = { name: string; workspace: string; createdAt: Date };

export type UserDataVersion = { version: string; publishedAt: Date; publishedByMe: boolean };
export type UserDataItem = {
  name: string;
  workspace: string;
  type: string;
  owner: boolean;
  versions: UserDataVersion[];
};

export type UserDataSubmission = {
  name: string;
  workspace: string;
  status: string;
  createdAt: Date;
  submittedAt: Date | null;
  revisions: number;
  files: string[];
};

export type UserDataComment = {
  submission: string;
  workspace: string;
  kind: string;
  body: string | null;
  createdAt: Date;
};

export type UserDataAuditEvent = {
  at: Date;
  action: string;
  as: "actor" | "target";
  target: { type: string; id: string | null };
  ipAddress: string | null;
  metadata: AuditMetadata;
};

/** The whole file. */
export type UserData = {
  version: typeof USER_DATA_VERSION;
  exportedAt: Date;
  instance: { name: string; url: string | null };
  /** The lists that were cut at the row limit (or whose comments were), when any. */
  truncated?: UserDataSection[];
  account: UserDataAccount;
  sessions: UserDataSession[];
  accessTokens: UserDataAccessToken[];
  deviceGrants: UserDataDeviceGrant[];
  workspaces: UserDataWorkspace[];
  accessRequests: UserDataAccessRequest[];
  scopes: UserDataScope[];
  favorites: UserDataFavorite[];
  feedback: UserDataFeedback[];
  onboarding: UserDataOnboarding;
  items: UserDataItem[];
  submissions: UserDataSubmission[];
  comments: UserDataComment[];
  auditEvents: UserDataAuditEvent[];
};

// An item's `@scope/name@1.0.0` has the shape of an address (see `isItemVersion`); accounts'
// addresses always have a dot after the "@" (normalizeEmail).
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;

/** `name@1.0.0` right after the `@` of `@scope/name@1.0.0`: a version, not an address. */
const isItemVersion = (match: string, before: string | undefined): boolean =>
  before === "@" && /^[\w.-]+\/[\w.-]+@\d+\.\d+\.\d+(-[\w-]+(\.\d+)*)?(\+\w+)?$/.test(match);

/**
 * The event's metadata with every email but the person's own replaced by `[other]` (104, decision
 * 4): the file is theirs, and an event about someone else is in it only because they acted. Walks
 * strings at any depth, inside sentences too.
 */
export const scrubOtherEmails = (value: AuditMetadata, ownEmail: string): AuditMetadata => {
  const own = ownEmail.toLowerCase();
  const scrubText = (text: string) =>
    text.replace(EMAIL, (match, offset: number) =>
      match.toLowerCase() === own || isItemVersion(match, text[offset - 1]) ? match : "[other]",
    );
  const scrub = (v: AuditMetadataValue): AuditMetadataValue => {
    if (typeof v === "string") return scrubText(v);
    if (Array.isArray(v)) return v.map(scrub);
    if (v !== null && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v).map(([k, nested]) => [scrubText(k), scrub(nested)]),
      );
    return v;
  };
  return scrub(value) as AuditMetadata;
};

/** A comment's body at most USER_DATA_COMMENT_MAX characters, `…` closing a cut one. */
export const cutBody = (
  body: string,
  max = USER_DATA_COMMENT_MAX,
): { body: string; cut: boolean } =>
  Array.from(body).length <= max
    ? { body, cut: false }
    : { body: `${Array.from(body).slice(0, max).join("")}…`, cut: true };
