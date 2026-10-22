import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { Locale } from "../models/locale";
import type { CoverageRow } from "../models/two-factor-coverage";
import type { CurrentUser, Role, RootAccount, UserSummary, WorkspaceRole } from "../models/user";

export type NewUserWithPassword = {
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  /** The role in `global` for someone who isn't root (091); `user` when left out. */
  globalRole?: WorkspaceRole;
};

/** What the admin user list filters by (008, on the data table since 061). */
export type UserFilters = {
  /** Part of the email or name, any case. */
  search?: string;
  role?: Role;
  /** `disabled` is disabled but not erased; `erased` (103) is erased. */
  status?: "active" | "disabled" | "erased";
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
  /** The oldest root, disabled or not (never erased, 103): the one setup created. Null before setup. */
  findFirstRoot(): Promise<RootAccount | null>;
  /** Every root, disabled or not, oldest first; never an erased row (103). */
  listRoots(): Promise<RootAccount[]>;
  /** Roots that aren't disabled or erased (103). The instance always keeps at least one (059). */
  countActiveRoots(): Promise<number>;
  /**
   * Locks every root's row and the actor's until the transaction ends, so two roots changing each
   * other at once run one after the other (059). Call it first in the transaction.
   */
  lockRoots(actorId: string): Promise<void>;
  /** The user, or null when they don't exist, are disabled or were erased (103). */
  findActiveUser(userId: string): Promise<CurrentUser | null>;
  /** A user and their password hash, for checking credentials outside a web sign-in (009). */
  findCredentialByEmail(email: string): Promise<{
    user: CurrentUser;
    disabledAt: Date | null;
    /** Erased (103): refused like a disabled one; it has no password row either. */
    erasedAt: Date | null;
    passwordHash: string | null;
    /** Two-factor is on: what makes a web sign-in ask for a code (105). */
    twoFactor: boolean;
  } | null>;
  /**
   * Every active account, as the two-factor coverage counts need it (105): root, a reviewer in a
   * shared workspace (moderator or admin), has a password, has two-factor on.
   */
  twoFactorCoverageRows(): Promise<CoverageRow[]>;
  /** Any user, disabled or not. */
  findUser(userId: string): Promise<UserSummary | null>;
  /**
   * Any user, as the users list shows them (their roles per workspace and two-factor), for one
   * user's page (123); null when there is none.
   */
  findUserDetail(userId: string): Promise<UserSummary | null>;
  /**
   * When each of these users last signed in to the web app, by id: the latest `auth.signed_in`
   * event (123). A user with none is absent. One query for all of them.
   */
  lastSignIns(userIds: string[]): Promise<Map<string, Date>>;
  /** Any user by their (normalised) email, disabled or not. */
  findUserByEmail(email: string): Promise<UserSummary | null>;
  /** One page of users in the query's order (keyset, 061). */
  pageUsers(query: UserPageQuery): Promise<KeysetPage<UserSummary>>;
  /** How many users match, up to the count cap. */
  countUsers(filters: UserFilters): Promise<{ count: number; capped: boolean }>;
  emailTaken(email: string): Promise<boolean>;
  /** Saves the person's language (129); null is automatic. An erased account is left alone (103). */
  setLocale(userId: string, locale: Locale | null, now: Date): Promise<void>;
  setRole(userId: string, role: Role, now: Date): Promise<void>;
  disableUser(userId: string, now: Date): Promise<void>;
  countActiveAccessTokens(userId: string): Promise<number>;
  /** Creates the user and its credential account together. Returns the new user's id. */
  createUserWithPassword(user: NewUserWithPassword, now: Date): Promise<string>;
  /** The same, for someone who signs in with an identity provider only (106): no credential account. */
  createUserWithoutPassword(
    user: Omit<NewUserWithPassword, "passwordHash">,
    now: Date,
  ): Promise<string>;
  /**
   * Sets the user's password, adding the password row when they have none (an account made by a
   * provider's sign-in, 106, or by SCIM, 108). Locks the user first: two at once add one row.
   */
  setPassword(userId: string, passwordHash: string, now: Date): Promise<void>;
  /** Asks (or stops asking) for the user's password to be replaced at their next sign-in (128). */
  setPasswordChangeRequired(userId: string, required: boolean, now: Date): Promise<void>;
  /** Whether the user must replace the password root chose before using the app (128). */
  passwordChangeRequired(userId: string): Promise<boolean>;
  enableUser(userId: string, now: Date): Promise<void>;
  /** Whether an email belongs to an active or a disabled user, or to nobody. For audit reasons only. */
  userStatusByEmail(email: string): Promise<"active" | "disabled" | null>;
  countSessions(userId: string): Promise<number>;
  /** Returns how many sessions ended. */
  deleteSessions(userId: string): Promise<number>;
  /** Returns how many active tokens were revoked. */
  revokeAccessTokens(userId: string, now: Date): Promise<number>;
  /** Every user's sessions and not-revoked tokens, for `revoke-access --everyone` (098). */
  countAllSessions(): Promise<number>;
  countAllActiveAccessTokens(): Promise<number>;
  /** Every identity provider's id and encrypted client secret (106), for rotate-secret. */
  providerSecrets(): Promise<{ id: string; secretEnc: string }[]>;
  setProviderSecret(id: string, secretEnc: string): Promise<void>;
  /** Ends every session on the instance; returns how many. */
  deleteAllSessions(): Promise<number>;
  /** Revokes every token not revoked yet, everyone's; returns how many. */
  revokeAllAccessTokens(now: Date): Promise<number>;
  /** Every identity provider's SCIM tokens that still work at `now` (108), for `revoke-access`. */
  countAllScimTokens(now: Date): Promise<number>;
  /** Revokes them all; returns how many. */
  revokeAllScimTokens(now: Date): Promise<number>;
  /** Cancels the user's open requests to join workspaces (094); returns how many. */
  cancelAccessRequests(userId: string, now: Date): Promise<number>;
  /**
   * Turns the user's two-factor off (105): deletes its record and an unfinished setup, and clears
   * the flag. True when there was anything to reset.
   */
  resetTwoFactor(userId: string, now: Date): Promise<boolean>;
  /** Whether `resetTwoFactor` would find anything: the flag on, or a record (a setup started). */
  hasTwoFactor(userId: string): Promise<boolean>;
  /** Whether two-factor is on as the hold and the users list read it: the flag and a confirmed record. */
  twoFactorOn(userId: string): Promise<boolean>;
  /**
   * Every account's two-factor off, for a new AUTH_SECRET (rotate-secret, a restore): the stored
   * secrets can't be decrypted any more. Returns how many accounts had a record.
   */
  clearAllTwoFactor(now: Date): Promise<number>;
  /** Records an audit event in this repository's transaction (feature 007). */
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
