import type { KeysetPage, SortDir } from "../../../db/keyset";
import type { AuditAction, AuditActionGroup, AuditEvent } from "../models/audit-event";

export type NewAuditRow = {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  /** Validated JSON text. */
  metadata: string;
  ipAddress: string | null;
  createdAt: Date;
  /** What it came from (166): the request, the channel, the client, the workspace, the outcome. */
  requestId: string | null;
  via: string | null;
  userAgent: string | null;
  workspaceId: string | null;
  outcome: string;
};

/** A workspace the audit log's filter offers (166); `deleted` when only its events are left. */
export type AuditWorkspace = { id: string; name: string; deleted: boolean };

/** What the audit log can be filtered by (060). Every filter is checked before it gets here. */
export type AuditFilters = {
  /** One action from the catalogue. */
  action?: AuditAction;
  /** Every action of a group, such as `user`. */
  group?: AuditActionGroup;
  /** Part of the actor's name or email, any case; or "system" for events without an actor. */
  actor?: string;
  /** One workspace's events, by id (166). */
  workspace?: string;
  /** One request's events (166), compared exactly; checked against 100's pattern first. */
  requestId?: string;
  /** Inclusive start and exclusive end, in UTC. */
  from?: Date;
  to?: Date;
};

/** Sorting by time orders by the id (a ULID); by action, by the action then the id. */
export type AuditSort = "time" | "action";

export type AuditQuery = AuditFilters & {
  sort: AuditSort;
  dir: SortDir;
  size: number;
  cursor?: string;
};

/**
 * What the audit log needs from storage. Insert and read only: there's deliberately no update or
 * delete (audit-log.guard.test.ts).
 */
export interface AuditRepository {
  insert(row: NewAuditRow): Promise<string>;
  /**
   * The workspaces the Workspace filter offers (166): every one there is, and every deleted one by
   * the name its `workspace.deleted` event recorded, by name.
   */
  workspaces(): Promise<AuditWorkspace[]>;
  /** One page, in the query's order (keyset, 060). */
  list(query: AuditQuery): Promise<KeysetPage<AuditEvent>>;
  /** How many events match, up to the count cap. */
  count(filters: AuditFilters): Promise<{ count: number; capped: boolean }>;
  findById(id: string): Promise<AuditEvent | null>;
}
