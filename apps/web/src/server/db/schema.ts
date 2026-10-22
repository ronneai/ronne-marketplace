import type { ColumnType, Generated } from "kysely";

/**
 * Timestamps are Dates in MySQL and PostgreSQL and ISO text in SQLite. Write them with toDbDate()
 * and read them with fromDbDate() (dates.ts).
 */
export type Timestamp = ColumnType<Date | string, Date | string, Date | string>;

/** A boolean column: boolean in PostgreSQL, 0/1 in MySQL and SQLite. */
type DbBoolean = ColumnType<boolean | number, boolean | number, boolean | number>;
/** A boolean with a default, so optional on insert (not `Generated<DbBoolean>`: it nests). */
type GeneratedDbBoolean = ColumnType<
  boolean | number,
  boolean | number | undefined,
  boolean | number
>;

/** Better Auth's user table, plus role and disabled_at (migration 0001_identity). */
export interface UserTable {
  id: string;
  name: string;
  email: string;
  email_verified: DbBoolean;
  image: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  role: Generated<"root" | "user">;
  disabled_at: Timestamp | null;
  /** Better Auth's two-factor flag (migration 0025_two_factor, feature 105). */
  two_factor_enabled: GeneratedDbBoolean;
  /** When root erased the account (migration 0030_erased_at, feature 103); never cleared. */
  erased_at: Timestamp | null;
  /** The language the person chose, `en`, `pt` or `fr` (migration 0032_user_locale, feature 129); null is automatic. */
  locale: string | null;
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

/**
 * Better Auth's two-factor row (migration 0025_two_factor, feature 105): the TOTP secret and the
 * backup codes, encrypted with a key from AUTH_SECRET; never read outside the identity domain.
 */
export interface TwoFactorTable {
  id: string;
  user_id: string;
  secret: string;
  backup_codes: string;
  verified: GeneratedDbBoolean;
  failed_verification_count: Generated<number>;
  lock_expires_at: Timestamp | null;
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
  /** `web`, `cli` or `device` (migration 0027). Null for older tokens. */
  created_via: string | null;
}

/**
 * The device flow's grants (migration 0027, feature 107): one code `rmk login --web` asked for.
 * Only the device code's hash is stored.
 */
export interface DeviceGrantTable {
  id: string;
  device_code_hash: string;
  user_code: string;
  client_id: string;
  name: string;
  /** `pending`, `approved`, `denied`, `spent` or `expired`. */
  status: string;
  user_id: string | null;
  requester_ip: string | null;
  approver_ip: string | null;
  interval_seconds: number;
  last_polled_at: Timestamp | null;
  decided_at: Timestamp | null;
  created_at: Timestamp;
  expires_at: Timestamp;
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

/**
 * Workspaces (migration 0019_workspaces, feature 090): the level above scopes. `global` is created by
 * the migration, with a fixed id, and is the only row with `is_global`.
 */
export interface WorkspaceTable {
  id: string;
  name: string;
  description: string;
  visibility: "public" | "private";
  is_global: DbBoolean;
  /** The user a personal workspace belongs to (114); null for `global` and shared ones. */
  owner_id: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * A user's role in a workspace (migration 0020_workspace_members, feature 091). Every user who
 * isn't root has a `global` row; a root's rows are ignored for permissions.
 */
export interface WorkspaceMemberTable {
  workspace_id: string;
  user_id: string;
  role: "admin" | "moderator" | "user";
  added_by: string | null;
  /** Null when set by hand; the identity provider's id when a group mapping gave it (106). */
  source: ColumnType<string | null, string | null | undefined, string | null>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/**
 * An identity provider root set up (migration 0026_identity_providers, feature 106). `config` is
 * the type's JSON without the client secret, which is `secret_enc` (encrypted); `domains` a JSON
 * array of the email domains the provider signs in (created on first sign-in, or linked by email).
 */
export interface IdentityProviderTable {
  id: string;
  type: string;
  preset: string;
  name: string;
  enabled: GeneratedDbBoolean;
  config: string;
  secret_enc: string | null;
  domains: string;
  link_by_email: GeneratedDbBoolean;
  groups_claim: string | null;
  tested_at: Timestamp | null;
  tested_by: string | null;
  last_signed_in_at: Timestamp | null;
  failures: Generated<number>;
  last_failure_at: Timestamp | null;
  last_failure_reason: string | null;
  created_by: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** When root turned SCIM on for it (0028, 108); null while it's off. */
  scim_enabled_at: ColumnType<
    Date | string | null,
    Date | string | null | undefined,
    Date | string | null
  >;
}

/** A group in a provider's claim that gives a role in a workspace (0026, 106). */
export interface ProviderGroupMappingTable {
  id: string;
  provider_id: string;
  group_name: string;
  /** Null once the workspace is deleted: the panel warns about it. */
  workspace_id: string | null;
  role: "admin" | "moderator" | "user";
  created_at: Timestamp;
}

/**
 * A provider's SCIM bearer token (migration 0028_scim, feature 108): only its SHA-256 hash. The
 * current one has no `expires_at`; a rotation gives the one before 24 hours.
 */
export interface ScimTokenTable {
  id: string;
  provider_id: string;
  token_hash: string;
  created_by: string | null;
  created_at: Timestamp;
  expires_at: Timestamp | null;
  revoked_at: Timestamp | null;
  last_used_at: Timestamp | null;
}

/** A provider's SCIM user linked to a Ronne account (0028, 108), with what it last sent. `id` is the SCIM id. */
export interface ScimUserTable {
  id: string;
  provider_id: string;
  user_id: string;
  external_id: string | null;
  /** The email, lowercased; null on a tombstone. */
  user_name: string | null;
  given_name: string | null;
  family_name: string | null;
  display_name: string | null;
  active: DbBoolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  /** Set by a deprovisioning DELETE: a tombstone the provider can no longer see. */
  deleted_at: Timestamp | null;
}

/** A provider's SCIM group (0028, 108); its mappings (106) give its members workspace roles. */
export interface ScimGroupTable {
  id: string;
  provider_id: string;
  display_name: string;
  external_id: string | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}

/** Who is in a SCIM group (0028, 108). */
export interface ScimGroupMemberTable {
  group_id: string;
  user_id: string;
  created_at: Timestamp;
}

/**
 * A request to join a workspace (migration 0021_workspace_access_requests, feature 094). At most
 * one `open` request per user and workspace, checked by the service. `workspace_id` is null for a
 * name no workspace has (yet).
 */
export interface WorkspaceAccessRequestTable {
  id: string;
  workspace_id: string | null;
  workspace_name: string;
  user_id: string;
  message: string | null;
  status: "open" | "approved" | "declined" | "cancelled";
  decided_by: string | null;
  /** Why it was declined, shown to the requester. */
  reason: string | null;
  created_at: Timestamp;
  decided_at: Timestamp | null;
}

/**
 * Moving a scope to another workspace (migration 0024_scope_moves, feature 115): open until
 * answered or cancelled; a move made at once is recorded approved. `new_name` is the scope's name
 * in the target.
 */
export interface ScopeMoveTable {
  id: string;
  scope_id: string;
  /** Null once the source workspace is deleted (only after its last scope left). */
  from_workspace_id: string | null;
  to_workspace_id: string;
  requested_by: string;
  new_name: string;
  message: string | null;
  status: "open" | "approved" | "declined" | "cancelled";
  decided_by: string | null;
  /** Why it was declined (shown to the asker), or why it was cancelled (`asker_lost_role`). */
  reason: string | null;
  created_at: Timestamp;
  decided_at: Timestamp | null;
}

/**
 * Scopes (migration 0004_scopes). `name` is stored without the `@`. Every scope belongs to one
 * workspace (0019_workspaces); an item's workspace is its scope's. Names are unique per workspace
 * (0022_workspace_in_names, feature 118), not across the instance.
 */
export interface ScopeTable {
  id: string;
  name: string;
  description: string;
  created_by: string | null;
  created_at: Timestamp;
  workspace_id: string;
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
  /** False when released from a personal workspace without review (114, decision 3). */
  reviewed: ColumnType<boolean | number, boolean | number | undefined, boolean | number>;
  /**
   * Who approved moving it out of a personal workspace (115), which made a not-reviewed version
   * reviewed. Null otherwise.
   */
  reviewed_by: ColumnType<string | null, string | null | undefined, string | null>;
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

/** Daily usage totals reported by `rmk` (migration 0012, feature 046). Nothing per person or project. */
export interface UsageDailyTable {
  item_id: string;
  /** The UTC day, `YYYY-MM-DD`. */
  day: string;
  version: string;
  tool: string;
  /** `install`, `remove` or `run`. */
  event: string;
  /** A run's trigger; "" for installs and removals. */
  run_trigger: string;
  /** A run's outcome; "" for installs and removals. */
  outcome: string;
  count: number;
}

/** A setting root changes in the app (migration 0013); no row means the setting's default. */
export interface InstanceSettingTable {
  key: string;
  value: string;
  updated_by: string | null;
  updated_at: Timestamp;
}

/** One row (id 1): raised with every change that can change a plugin feed (079). */
export interface CatalogueRevisionTable {
  id: number;
  /** A random id for this database, so a cache can tell two databases' revisions apart. */
  instance: string;
  revision: number;
}

/** What each tool's marketplace measured when it was last built (079). */
export interface PluginFeedTable {
  tool: string;
  size_bytes: number;
  plugins: number;
  build_ms: number;
  revision: number;
  built_at: Timestamp;
  /** The revision the last warning was logged for, so it's logged once. */
  warned_revision: number | null;
}

/** A scheduled job's row (102): its lease while a run holds it, and its last run. */
export interface JobTable {
  name: string;
  lease_holder: string | null;
  lease_ends_at: Timestamp | null;
  last_run_at: Timestamp | null;
  last_result: string | null;
}

/**
 * An item's old full name (migration 0022_workspace_in_names, feature 118): one it answered to before
 * a move or a rename, canonical (`@scope/name` in `global`). Reserved: no other item takes it.
 */
/**
 * An erasure whose audit log rewrite isn't done (migration 0031, feature 103): the old address the
 * rewrite looks for and the counts the `user.erased` event will record. Deleted when it's done.
 */
export interface UserErasureTable {
  user_id: string;
  email: string;
  /** JSON: the erasure's counts so far. */
  counts: string;
  /** Rows of the audit log rewritten so far, by every attempt. */
  events_rewritten: Generated<number>;
  actor_id: string | null;
  started_at: Timestamp;
}

/** A person's favorite item (migration 0033, feature 125). Theirs alone. */
export interface ItemFavoriteTable {
  user_id: string;
  item_id: string;
  created_at: Timestamp;
}

/**
 * An item on a shelf (0033, 125): `workspace_id` null is the instance's "Start here" shelf. `shelf`
 * is that shelf as a key (the workspace's id, or `instance`), since a unique key can't hold a null.
 */
export interface ItemPinTable {
  id: string;
  workspace_id: string | null;
  shelf: string;
  item_id: string;
  /** 1, 2, 3… on a shelf; the repository keeps it dense. */
  position: number;
  created_by: string | null;
  created_at: Timestamp;
}

export interface ItemAliasTable {
  name: string;
  item_id: string;
  /** Why it's an old name: `migration`, `move` or `rename`. */
  reason: string;
  created_at: Timestamp;
}

/** Kysely table types for the whole app. Each migration that adds a table adds its interface here. */
export interface Database {
  user: UserTable;
  user_erasures: UserErasureTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  two_factor: TwoFactorTable;
  access_tokens: AccessTokenTable;
  device_grants: DeviceGrantTable;
  audit_log: AuditLogTable;
  jobs: JobTable;
  workspaces: WorkspaceTable;
  workspace_members: WorkspaceMemberTable;
  identity_providers: IdentityProviderTable;
  provider_group_mappings: ProviderGroupMappingTable;
  scim_tokens: ScimTokenTable;
  scim_users: ScimUserTable;
  scim_groups: ScimGroupTable;
  scim_group_members: ScimGroupMemberTable;
  workspace_access_requests: WorkspaceAccessRequestTable;
  scope_moves: ScopeMoveTable;
  scopes: ScopeTable;
  submissions: SubmissionTable;
  submission_files: SubmissionFileTable;
  submission_revisions: SubmissionRevisionTable;
  submission_revision_files: SubmissionRevisionFileTable;
  review_events: ReviewEventTable;
  items: ItemTable;
  item_aliases: ItemAliasTable;
  item_favorites: ItemFavoriteTable;
  item_pins: ItemPinTable;
  item_versions: ItemVersionTable;
  dist_tags: DistTagTable;
  version_dependencies: VersionDependencyTable;
  usage_daily: UsageDailyTable;
  instance_settings: InstanceSettingTable;
  catalogue_revision: CatalogueRevisionTable;
  plugin_feeds: PluginFeedTable;
}
