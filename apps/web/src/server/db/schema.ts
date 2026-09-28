import type { ColumnType, Generated } from "kysely";

/**
 * Timestamps are Dates in MySQL and PostgreSQL and ISO text in SQLite. Write them with toDbDate()
 * and read them with fromDbDate() (dates.ts).
 */
export type Timestamp = ColumnType<Date | string, Date | string, Date | string>;

/** Better Auth's email_verified: boolean in MySQL and PostgreSQL, 0/1 in SQLite. */
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

/** Kysely table types for the whole app. Each migration that adds a table adds its interface here. */
export interface Database {
  user: UserTable;
  session: SessionTable;
  account: AccountTable;
  verification: VerificationTable;
  access_tokens: AccessTokenTable;
  audit_log: AuditLogTable;
  scopes: ScopeTable;
}
