import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { UserSummary } from "../models/user";
import type {
  UserDataAccessRequest,
  UserDataAccessToken,
  UserDataAccount,
  UserDataAuditEvent,
  UserDataComment,
  UserDataDeviceGrant,
  UserDataFavorite,
  UserDataItem,
  UserDataOnboarding,
  UserDataScope,
  UserDataSession,
  UserDataSubmission,
  UserDataWorkspace,
} from "../models/user-data";

/**
 * What making a person's data file needs from storage (feature 104): read-only, and only the
 * columns that belong in the file (never a hash, secret, backup code or provider token). Every
 * list is oldest first and holds at most `limit` rows; the service asks for one more than it shows
 * to know a list was cut. Kysely: kysely-user-data-repository.ts.
 */
export interface UserDataRepository {
  transaction<T>(work: (repo: UserDataRepository) => Promise<T>): Promise<T>;
  /** Locks the account's row until the transaction ends, so two downloads can't both pass. */
  lockUser(userId: string): Promise<UserSummary | null>;
  /** When the person's data was last downloaded after `since`, else null. */
  exportedSince(userId: string, since: Date): Promise<Date | null>;
  /** When it was last downloaded at all, for the Account page. */
  lastExported(userId: string): Promise<Date | null>;
  account(userId: string): Promise<UserDataAccount | null>;
  sessions(userId: string, limit: number): Promise<UserDataSession[]>;
  accessTokens(userId: string, limit: number): Promise<UserDataAccessToken[]>;
  deviceGrants(userId: string, limit: number): Promise<UserDataDeviceGrant[]>;
  workspaces(userId: string, limit: number): Promise<UserDataWorkspace[]>;
  accessRequests(userId: string, limit: number): Promise<UserDataAccessRequest[]>;
  scopes(userId: string, limit: number): Promise<UserDataScope[]>;
  /** The person's favorites, oldest first (125). */
  favorites(userId: string, limit: number): Promise<UserDataFavorite[]>;
  /** What they did with the Getting started panel (126); null when they never did anything. */
  onboarding(userId: string): Promise<UserDataOnboarding>;
  /** Items the person owns or published a version of; `limit` counts versions. */
  items(userId: string, limit: number): Promise<{ items: UserDataItem[]; versions: number }>;
  submissions(userId: string, limit: number): Promise<UserDataSubmission[]>;
  comments(userId: string, limit: number): Promise<UserDataComment[]>;
  /** Events the person acted in or was the target of, metadata as stored. */
  auditEvents(userId: string, limit: number): Promise<UserDataAuditEvent[]>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
