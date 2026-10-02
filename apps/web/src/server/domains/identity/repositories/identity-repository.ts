import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { CurrentUser, Role, RootAccount, UserSummary } from "../models/user";

export type NewUserWithPassword = {
  email: string;
  name: string;
  role: "root" | "moderator" | "user";
  passwordHash: string;
};

/** What the admin user list filters by (008, on the data table since 061). */
export type UserFilters = {
  /** Part of the email or name, any case. */
  search?: string;
  role?: Role;
  status?: "active" | "disabled";
};

/** `created` sorts by the id (a ULID); `email` and `name` by that column, then the id. */
export type UserSort = "created" | "email" | "name";

export type UserPageQuery = UserFilters & {
  sort: UserSort;
  dir: SortDir;
  size: number;
  cursor?: string;
};

/** What the identity services need from storage. Implemented with Kysely in kysely-identity-repository.ts. */
export interface IdentityRepository {
  /** Runs `work` in one database transaction, with a repository bound to it. */
  transaction<T>(work: (repo: IdentityRepository) => Promise<T>): Promise<T>;
  /** The oldest root, disabled or not: the one setup created. Null before setup. */
  findFirstRoot(): Promise<RootAccount | null>;
  /** Every root, disabled or not, oldest first. */
  listRoots(): Promise<RootAccount[]>;
  /** Roots that aren't disabled. The instance always keeps at least one (059). */
  countActiveRoots(): Promise<number>;
  /**
   * Locks every root's row and the actor's until the transaction ends, so two roots changing each
   * other at once run one after the other (059). Call it first in the transaction.
   */
  lockRoots(actorId: string): Promise<void>;
  /** The user, or null when they don't exist or are disabled. */
  findActiveUser(userId: string): Promise<CurrentUser | null>;
  /** A user and their password hash, for checking credentials outside a web sign-in (009). */
  findCredentialByEmail(email: string): Promise<{
    user: CurrentUser;
    disabledAt: Date | null;
    passwordHash: string | null;
  } | null>;
  /** Any user, disabled or not. */
  findUser(userId: string): Promise<UserSummary | null>;
  /** One page of users in the query's order (keyset, 061). */
  pageUsers(query: UserPageQuery): Promise<KeysetPage<UserSummary>>;
  /** How many users match, up to the count cap. */
  countUsers(filters: UserFilters): Promise<{ count: number; capped: boolean }>;
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
