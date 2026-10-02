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
};

/** What the audit log can be filtered by (060). Every filter is checked before it gets here. */
export type AuditFilters = {
  /** One action from the catalogue. */
  action?: AuditAction;
  /** Every action of a group, such as `user`. */
  group?: AuditActionGroup;
  /** Part of the actor's email, any case; or "system" for events without an actor. */
  actor?: string;
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
  /** One page, in the query's order (keyset, 060). */
  list(query: AuditQuery): Promise<KeysetPage<AuditEvent>>;
  /** How many events match, up to the count cap. */
  count(filters: AuditFilters): Promise<{ count: number; capped: boolean }>;
  findById(id: string): Promise<AuditEvent | null>;
}
