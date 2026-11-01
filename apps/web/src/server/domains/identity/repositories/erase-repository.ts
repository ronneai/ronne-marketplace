import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { WorkspaceRepository } from "../../workspaces/repositories/workspace-repository";
import type { UserSummary } from "../models/user";
import type { IdentityRepository } from "./identity-repository";

/** How a page of the audit log rewrite reports (103). */
export type RewriteProgress = (done: number) => Promise<void> | void;

/** An erasure whose rewrite isn't finished (103's MySQL edge case), as the Privacy tab lists it. */
export type PendingErasure = {
  userId: string;
  email: string;
  counts: Record<string, number | string>;
  /** Rows of the audit log rewritten so far, by every attempt. */
  eventsRewritten: number;
  actorId: string | null;
  startedAt: Date;
};

/**
 * What erasing a user needs from storage (feature 103): every table the person is in. Kysely:
 * kysely-erase-repository.ts. The `identity` repository bound to the same transaction gives the
 * steps erasing shares with disabling (locks, sessions, requests); `workspaces` the personal
 * workspace's rename (113).
 */
export interface EraseRepository {
  transaction<T>(work: (repo: EraseRepository) => Promise<T>): Promise<T>;
  readonly identity: IdentityRepository;
  readonly workspaces: WorkspaceRepository;
  /** Whether the metadata rewrite runs after the main transaction (MySQL and MariaDB) or inside it. */
  readonly rewritesAfterCommit: boolean;
  /** Locks the account's row until the transaction ends, then reads it. */
  lockUser(userId: string): Promise<UserSummary | null>;
  /** The row as the spec's table leaves it: pseudonym, no image, flags off, disabled and erased. */
  anonymizeUser(
    userId: string,
    pseudonym: { email: string; name: string },
    at: Date,
  ): Promise<void>;
  /** Password and identity-provider links, two-factor and verification rows. */
  deleteCredentials(userId: string, email: string): Promise<void>;
  /** Deleted, not revoked (a revoked row names the token). Returns how many. */
  deleteAccessTokens(userId: string): Promise<number>;
  deleteDeviceGrants(userId: string): Promise<number>;
  /** The person's favorites (125): theirs alone, so they go with them. Returns how many. */
  deleteFavorites(userId: string): Promise<number>;
  /** The person's Getting started state (126): theirs alone, so it goes with them. */
  deleteOnboarding(userId: string): Promise<void>;
  /**
   * What they sent with Send feedback (127): the message is theirs, personal data, so it is
   * deleted, not kept under the pseudonym. Returns how many.
   */
  deleteFeedback(userId: string): Promise<number>;
  /**
   * Their notifications (139): what happened to their work and what waited for them is theirs
   * alone, so it goes with them. The ones they caused for others stay: the name is read when shown,
   * and by then it is the pseudonym. Returns how many.
   */
  deleteNotifications(userId: string): Promise<number>;
  /** Live links and tombstones (108), and the provider groups' memberships. Returns the links. */
  deleteScimRows(userId: string): Promise<number>;
  /** Every workspace membership, the personal one's included. Returns how many. */
  deleteMemberships(userId: string): Promise<number>;
  /** Open scope moves the person asked for (115), cancelled with no reason. Returns how many. */
  cancelScopeMoves(userId: string, at: Date): Promise<number>;
  /** Open item moves the person asked for (134), cancelled with no reason. Returns how many. */
  cancelItemMoves(userId: string, at: Date): Promise<number>;
  /** Drafts (status `draft`) with their files. Returns how many. */
  deleteDrafts(userId: string): Promise<number>;
  /** The personal workspace (114), when there is one. */
  personalWorkspace(userId: string): Promise<{ id: string; name: string } | null>;
  /** Whether the workspace holds a published item or any submission (another person's draft too). */
  holdsRecord(workspaceId: string): Promise<boolean>;
  /** Deletes a workspace that holds nothing but scopes (and their drafts, gone already). */
  deleteEmptyWorkspace(workspaceId: string): Promise<void>;
  /** Clears the IP address of every event the person acted in or was the target of. */
  clearAuditIps(userId: string): Promise<number>;
  /** The email in every event's metadata becomes the pseudonym's; see kysely-audit-rewrite.ts. */
  rewriteEmail(
    job: { userId: string; email: string; replacement: string },
    options: { batch?: number; onBatch?: RewriteProgress },
  ): Promise<number>;
  insertErasure(row: PendingErasure): Promise<void>;
  /** Adds a page's rewritten rows to the erasure's count, so an attempt's progress is kept. */
  addRewritten(userId: string, rows: number): Promise<void>;
  /**
   * Removes the row and returns its rewritten count, or null when it was gone already: the caller
   * that removes it records the event, so a retry and the job can't both.
   */
  deleteErasure(userId: string): Promise<{ eventsRewritten: number } | null>;
  pendingErasures(): Promise<PendingErasure[]>;
  recordAudit(event: NewAuditEvent, at: Date): Promise<void>;
}
