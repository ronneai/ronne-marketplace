import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { ScimGroupFilter, ScimGroupRow } from "../models/scim-group";
import type { UserSummary } from "../models/user";
import type { GroupSyncRepository } from "../services/group-sync";

/** A live link, as a group's member: the SCIM id, and the account behind it. */
export type ScimMemberLink = { linkId: string; userId: string; display: string };

/** What SCIM Groups need from storage (feature 108). Kysely: kysely-scim-group-repository.ts. */
export interface ScimGroupRepository {
  transaction<T>(work: (repo: ScimGroupRepository) => Promise<T>): Promise<T>;
  /** 106's membership steps, bound to the same transaction. */
  readonly groupSync: GroupSyncRepository;
  /** Locks the provider's row until the transaction ends. Null when there's no such provider. */
  lockProvider(providerId: string): Promise<{ scimEnabled: boolean } | null>;
  findGroup(providerId: string, id: string): Promise<ScimGroupRow | null>;
  findGroupByExternalId(providerId: string, externalId: string): Promise<ScimGroupRow | null>;
  /** The provider's groups in creation order, `startIndex` 1-based, at most `count`. */
  listGroups(
    providerId: string,
    query: { filter: ScimGroupFilter | null; startIndex: number; count: number },
  ): Promise<{ rows: ScimGroupRow[]; total: number }>;
  insertGroup(row: Omit<ScimGroupRow, "id" | "updatedAt">): Promise<string>;
  updateGroup(
    id: string,
    fields: { displayName?: string; externalId?: string | null },
    at: Date,
  ): Promise<void>;
  /** Deletes the group; its member rows go with it. */
  deleteGroup(id: string): Promise<void>;
  /** The accounts in the group. */
  memberIds(groupId: string): Promise<string[]>;
  addMember(groupId: string, userId: string, at: Date): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
  /** The provider's live links among these SCIM ids (unknown and deleted ones left out). */
  liveLinks(providerId: string, linkIds: string[]): Promise<ScimMemberLink[]>;
  /** The live links of these accounts, for showing a group's members. */
  linksOfUsers(providerId: string, userIds: string[]): Promise<ScimMemberLink[]>;
  /** Every name of every provider group the account is in (`groupNames`), for its mappings. */
  groupNamesOf(providerId: string, userId: string): Promise<string[]>;
  findUser(userId: string): Promise<UserSummary | null>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
