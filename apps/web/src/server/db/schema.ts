import type { ColumnType, Generated } from "kysely";

/**
 * Timestamps are Dates in MySQL and PostgreSQL and ISO text in SQLite. Write them with toDbDate()
 * and read them with fromDbDate() (dates.ts).
 */
export type Timestamp = ColumnType<Date | string, Date | string, Date | string>;

/** A boolean column: boolean in PostgreSQL, 0/1 in MySQL and SQLite. */
type DbBoolean = ColumnType<boolean | number, boolean | number, boolean | number>;

/** Better Auth's user table, plus role and disabled_at (migration 0001_identity). */
export interface UserTable {
  id: string;
  name: string;
  email: string;
  email_verified: DbBoolean;
  image: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  role: Generated<"root" | "moderator" | "user">;
  disabled_at: Timestamp | null;
}

export interface SessionTable {
  id: string;
  expires_at: Timestamp;
  token: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  ip_address: string | null;
  user_agent: string | null;
  user_id: string;
}

export interface AccountTable {
  id: string;
  account_id: string;
  provider_id: string;
  user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  id_token: string | null;
  access_token_expires_at: Timestamp | null;
  refresh_token_expires_at: Timestamp | null;
  scope: string | null;
  password: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface VerificationTable {
  id: string;
  identifier: string;
  value: string;
  expires_at: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Personal access tokens for rmk and the MCP server. Only the sha256 hash is stored. */
export interface AccessTokenTable {
  id: string;
  user_id: string;
  name: string;
  token_hash: string;
  /** `rmk_` + 8 characters, to tell tokens apart (migration 0003). Null for older tokens. */
  token_prefix: string | null;
  last_used_at: Timestamp | null;
  expires_at: Timestamp | null;
  revoked_at: Timestamp | null;
  created_at: Timestamp;
}

/**
 * The audit log (migration 0002_audit_log). Insert-only: metadata is JSON text, never secrets.
 * `actor_id` is null for the system or the command line.
 */
export interface AuditLogTable {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: string;
  ip_address: string | null;
  created_at: Timestamp;
}

/** Scopes (migration 0004_scopes). `name` is stored without the `@`. */
export interface ScopeTable {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: Timestamp;
}

/**
 * Drafts and submissions of items (migration 0005_submissions, feature 012). The manifest isn't a
 * column: it's the `ronne.yaml` row in submission_files.
 */
export interface SubmissionTable {
  id: string;
  author_id: string;
  scope_id: string;
  /** The item's name without the scope. */
  name: string;
  type: string;
  /** Null for a new item; 017 fills it for change proposals. */
  item_id: string | null;
  base_version_id: string | null;
  /** JSON: a proposal's open rebase conflicts, as paths (migration 0010, feature 017). */
  rebase_conflicts: string | null;
  status: string;
  created_at: Timestamp;
  updated_at: Timestamp;
  submitted_at: Timestamp | null;
}

/** A submission's files. `content` is UTF-8 text, or base64 when `encoding` is `base64`. */
export interface SubmissionFileTable {
  submission_id: string;
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  /** Bytes of the file itself, not of its base64. */
  size: number;
  executable: DbBoolean;
  updated_at: Timestamp;
}

/** A snapshot of a submission's files, made on every submit and resubmit (migration 0006, 014). */
export interface SubmissionRevisionTable {
  id: string;
  submission_id: string;
  /** 1 for the first submit, then one more for each resubmit. */
  number: number;
  created_by: string;
  created_at: Timestamp;
}

/** A revision's files: the same shape as submission_files, without `updated_at`. */
export interface SubmissionRevisionFileTable {
  revision_id: string;
  path: string;
  encoding: "utf8" | "base64";
  content: string;
  size: number;
  executable: DbBoolean;
}

/** The review conversation: comments, decisions, submits and withdrawals (migration 0006, 014). */
export interface ReviewEventTable {
  id: string;
  submission_id: string;
  actor_id: string;
  kind: string;
  body: string | null;
  /** The revision the event is about, when there is one. */
  revision: number | null;
  created_at: Timestamp;
}

/** A published item (migration 0007_items, feature 015): created by its first release. */
export interface ItemTable {
  id: string;
  scope_id: string;
  name: string;
  type: string;
  description: string;
  /** The first author; informational (MVP §15). */
  owner_id: string | null;
  created_at: Timestamp;
  /** Artifact downloads, counted by the tarball endpoint (migration 0009, features 018 and 019). */
  download_count: Generated<number>;
  /** The version the catalogue shows: `latest`'s, else the newest (0009). */
  listed_version_id: string | null;
  /** Whether any version isn't yanked (0009). */
  installable: Generated<boolean | number>;
  /** When the newest version was released (0009). */
  last_published_at: Timestamp | null;
}

/** An immutable published version. `manifest` and `files` are JSON text. */
export interface ItemVersionTable {
  id: string;
  item_id: string;
  version: string;
  manifest: string;
  readme: string | null;
  /** JSON: `[{ path, size, executable }]`. */
  files: string;
  notes: string | null;
  artifact_path: string;
  sha256: string;
  size: number;
  published_by: string;
  published_at: Timestamp;
  deprecated_message: string | null;
  yanked_at: Timestamp | null;
  /** Why it was yanked (migration 0008, feature 016). */
  yank_reason: string | null;
  /** The submission it was released from. */
  submission_id: string | null;
  /** From the manifest, for search (migration 0009, feature 018). */
  description: Generated<string>;
  /** The manifest's keywords, space-separated, for search (0009). */
  keywords: Generated<string>;
  /** JSON: the version's risk flags (014), computed at release (0009). */
  risk_flags: string | null;
  /** The AI tools its manifest turns off, as ` id id `, for the `?tool=` filter (0011, 026). */
  disabled_targets: Generated<string>;
}

/** A movable pointer to a version, such as `latest` (MVP §3.4). */
export interface DistTagTable {
  item_id: string;
  tag: string;
  version_id: string;
}

/** A version's dependencies, from its manifest. */
export interface VersionDependencyTable {
  version_id: string;
  depends_on_item_id: string;
  range: string;
}

/** Kysely table types for the whole app. Each migration that adds a table adds its interface here. */
export interface Database {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  access_tokens: AccessTokenTable;
  audit_log: AuditLogTable;
  scopes: ScopeTable;
  submissions: SubmissionTable;
  submission_files: SubmissionFileTable;
  submission_revisions: SubmissionRevisionTable;
  submission_revision_files: SubmissionRevisionFileTable;
  review_events: ReviewEventTable;
  items: ItemTable;
  item_versions: ItemVersionTable;
  dist_tags: DistTagTable;
  version_dependencies: VersionDependencyTable;
}
