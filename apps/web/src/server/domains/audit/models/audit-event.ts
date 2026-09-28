import {
  AuditMetadataTooLargeError,
  SecretInAuditMetadataError,
  UnknownAuditActionError,
} from "../exceptions/errors";

/** Every action the app records (spec 007's catalogue). Later features add theirs here. */
export const AUDIT_ACTIONS = [
  "instance.root_created",
  "user.password_reset",
  "auth.signed_in",
  "auth.sign_in_failed",
  "auth.signed_out",
  "user.password_changed",
  "user.created",
  "user.role_changed",
  "user.disabled",
  "user.enabled",
  "access_token.created",
  "access_token.revoked",
  "scope.created",
  "scope.updated",
  "submission.submitted",
  "submission.resubmitted",
  "submission.withdrawn",
  "submission.approved",
  "submission.changes_requested",
  "submission.rejected",
  "submission.override_approved",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** The groups the audit page filters by: the part before the dot. */
export const AUDIT_ACTION_GROUPS = [
  "auth",
  "user",
  "access_token",
  "scope",
  "submission",
  "instance",
] as const;
export type AuditActionGroup = (typeof AUDIT_ACTION_GROUPS)[number];

export const actionsInGroup = (group: AuditActionGroup): AuditAction[] => {
  return AUDIT_ACTIONS.filter((action) => action.startsWith(`${group}.`));
};

export type AuditTargetType =
  | "user"
  | "access_token"
  | "session"
  | "scope"
  | "submission"
  | "instance"
  | "none";

export type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | AuditMetadataValue[]
  | { [key: string]: AuditMetadataValue };
export type AuditMetadata = { [key: string]: AuditMetadataValue };

/** What a service records. `actorId` is null for the system or the command line. */
export type NewAuditEvent = {
  actorId: string | null;
  action: AuditAction;
  target: { type: AuditTargetType; id?: string | null };
  metadata?: AuditMetadata;
  ipAddress?: string | null;
};

/** A stored event, as the audit page reads it. */
export type AuditEvent = {
  id: string;
  actorId: string | null;
  /** The actor's email, when the user still exists. */
  actorEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: AuditMetadata;
  ipAddress: string | null;
  createdAt: Date;
};

export const AUDIT_METADATA_MAX_BYTES = 4096;

/** Words that mark a key as a secret, wherever they appear in it. */
const SECRET_WORDS = new Set(["password", "passwd", "secret", "hash", "salt", "cookie"]);
/** Words that mark a key as a secret only as its last word: `token` is, `tokensRevoked` isn't. */
const SECRET_LAST_WORDS = new Set(["token", "key", "credential", "credentials"]);

/** Splits camelCase, snake_case and kebab-case keys into lowercase words. */
const words = (key: string): string[] => {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_\-.]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
};

export const isSecretKey = (key: string): boolean => {
  const parts = words(key);
  return parts.some((w) => SECRET_WORDS.has(w)) || SECRET_LAST_WORDS.has(parts.at(-1) ?? "");
};

const checkKeys = (value: AuditMetadataValue): void => {
  if (Array.isArray(value)) {
    for (const item of value) checkKeys(item);
  } else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (isSecretKey(key)) throw new SecretInAuditMetadataError(key);
      checkKeys(nested);
    }
  }
};

/**
 * Checks an event before it's stored: a known action, no secret-looking keys at any depth, and at
 * most 4 KB of metadata. Returns the metadata as JSON text.
 */
export const validateAuditEvent = (event: NewAuditEvent): string => {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(event.action))
    throw new UnknownAuditActionError(event.action);
  const metadata = event.metadata ?? {};
  checkKeys(metadata);
  const json = JSON.stringify(metadata);
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes > AUDIT_METADATA_MAX_BYTES) throw new AuditMetadataTooLargeError(bytes);
  return json;
};
