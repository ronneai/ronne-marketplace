import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { ScimAccountState, ScimUserFilter, ScimUserLink } from "../models/scim-user";
import type { UserSummary } from "../models/user";
import type { GroupSyncRepository } from "../services/group-sync";
import type { IdentityRepository } from "./identity-repository";

/** A new live link, as a create writes it. */
export type NewScimLink = Omit<ScimUserLink, "id" | "updatedAt">;

/** The fields a replace or a patch may change on a link. */
export type ScimLinkPatch = Partial<
  Pick<
    ScimUserLink,
    "externalId" | "userName" | "givenName" | "familyName" | "displayName" | "active"
  >
>;

export type ScimUserPage = { rows: ScimUserLink[]; total: number };

/** What SCIM Users need from storage (feature 108). Kysely: kysely-scim-user-repository.ts. */
export interface ScimUserRepository {
  transaction<T>(work: (repo: ScimUserRepository) => Promise<T>): Promise<T>;
  /** The identity repository bound to the same transaction, for the account steps the services share. */
  readonly identity: IdentityRepository;
  /** 106's membership steps, bound to the same transaction, for a deleted user's groups. */
  readonly groupSync: GroupSyncRepository;
  /** Every name of every provider group the account is in, for its mappings. */
  groupNamesOf(providerId: string, userId: string): Promise<string[]>;
  /**
   * Locks the provider's row until the transaction ends, so one SCIM write per provider runs at a
   * time. Null when there's no such provider.
   */
  lockProvider(providerId: string): Promise<{ scimEnabled: boolean } | null>;
  /** Locks the account's row too, so its state read next is the state written against. */
  lockUser(userId: string): Promise<void>;
  /** A live link (never a tombstone) of this provider, by its SCIM id. */
  findLink(providerId: string, id: string): Promise<ScimUserLink | null>;
  findLinkByUserName(providerId: string, userName: string): Promise<ScimUserLink | null>;
  findLinkByExternalId(providerId: string, externalId: string): Promise<ScimUserLink | null>;
  /** This provider's tombstone with that external id, the way back for a deleted user. */
  findTombstoneByExternalId(
    providerId: string,
    externalId: string,
  ): Promise<{ id: string; userId: string } | null>;
  /** Whether the account has a SCIM link on any provider, live or deleted. */
  hasAnyLink(userId: string): Promise<boolean>;
  /** The provider's live links in creation order, `startIndex` 1-based, at most `count`. */
  listLinks(
    providerId: string,
    query: { filter: ScimUserFilter | null; startIndex: number; count: number },
  ): Promise<ScimUserPage>;
  insertLink(row: NewScimLink): Promise<string>;
  updateLink(id: string, patch: ScimLinkPatch, at: Date): Promise<void>;
  /** The DELETE: `deleted_at` set, `user_name` cleared, `active` off; the external id stays. */
  tombstoneLink(id: string, at: Date): Promise<void>;
  /** Removes a row outright: a tombstone a new link replaces. */
  deleteLink(id: string): Promise<void>;
  /** Takes the user out of every group of the provider; returns the groups they were in. */
  removeFromGroups(providerId: string, userId: string): Promise<string[]>;
  /** The provider's groups the user is in, for the resource's `groups`. */
  groupsOf(providerId: string, userId: string): Promise<{ id: string; displayName: string }[]>;
  findUser(userId: string): Promise<UserSummary | null>;
  /** The account with that (lowercased) email as the database compares it; the caller checks it exactly. */
  findUserByEmail(email: string): Promise<UserSummary | null>;
  /** A new `user`: in `global`, with a personal workspace, no password. Returns its id. */
  createUser(user: { email: string; name: string }, now: Date): Promise<string>;
  updateUserProfile(
    userId: string,
    fields: { email?: string; name?: string },
    now: Date,
  ): Promise<void>;
  enableUser(userId: string, now: Date): Promise<void>;
  /** 106's link: the account signs in through this provider (an `account` row for it). */
  hasProviderAccount(userId: string, providerId: string): Promise<boolean>;
  /** Whether the account signed in through the provider at or after `since` (`auth.sso_signed_in`). */
  signedInThroughSince(userId: string, providerId: string, since: Date): Promise<boolean>;
  /** Each of these accounts' SCIM state, when it has a link (live or deleted). */
  accountStates(userIds: string[]): Promise<Map<string, ScimAccountState>>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
