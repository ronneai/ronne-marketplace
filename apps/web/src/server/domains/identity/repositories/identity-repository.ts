import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { CurrentUser, Role, RootAccount, UserSummary } from "../models/user";

export type NewUserWithPassword = {
  email: string;
  name: string;
  role: "root" | "moderator" | "user";
  passwordHash: string;
};

export type UserListQuery = {
  /** Part of the email or name, any case. */
  search?: string;
  role?: Role;
  status?: "active" | "disabled";
  /** Only users older than this id (the last id of the previous page). */
  cursor?: string;
  limit: number;
};

/** What the identity services need from storage. Implemented with Kysely in kysely-identity-repository.ts. */
export interface IdentityRepository {
  /** Runs `work` in one database transaction, with a repository bound to it. */
  transaction<T>(work: (repo: IdentityRepository) => Promise<T>): Promise<T>;
  findRoot(): Promise<RootAccount | null>;
  /** The user, or null when they don't exist or are disabled. */
  findActiveUser(userId: string): Promise<CurrentUser | null>;
  /** Any user, disabled or not. */
  findUser(userId: string): Promise<UserSummary | null>;
  /** Newest first. */
  listUsers(query: UserListQuery): Promise<UserSummary[]>;
  emailTaken(email: string): Promise<boolean>;
  setRole(userId: string, role: Role, now: Date): Promise<void>;
  disableUser(userId: string, now: Date): Promise<void>;
  countActiveAccessTokens(userId: string): Promise<number>;
  /** Creates the user and its credential account together. Returns the new user's id. */
  createUserWithPassword(user: NewUserWithPassword, now: Date): Promise<string>;
  setPassword(userId: string, passwordHash: string, now: Date): Promise<void>;
  enableUser(userId: string, now: Date): Promise<void>;
  /** Whether an email belongs to an active or a disabled user, or to nobody. For audit reasons only. */
  userStatusByEmail(email: string): Promise<"active" | "disabled" | null>;
  countSessions(userId: string): Promise<number>;
  /** Returns how many sessions ended. */
  deleteSessions(userId: string): Promise<number>;
  /** Returns how many active tokens were revoked. */
  revokeAccessTokens(userId: string, now: Date): Promise<number>;
  /** Records an audit event in this repository's transaction (feature 007). */
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
