import type { AuditActionGroup, AuditEvent } from "../models/audit-event";

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

export type AuditQuery = {
  /** Only events older than this id (the last id of the previous page). */
  cursor?: string;
  limit: number;
  group?: AuditActionGroup;
  /** A user id, or "system" for events without an actor. */
  actor?: string;
  /** Inclusive start and exclusive end, in UTC. */
  from?: Date;
  to?: Date;
};

/**
 * What the audit log needs from storage. Insert and read only: there's deliberately no update or
 * delete (audit-log.guard.test.ts).
 */
export interface AuditRepository {
  insert(row: NewAuditRow): Promise<string>;
  /** Newest first. */
  list(query: AuditQuery): Promise<AuditEvent[]>;
  /** The users who appear as actors, for the actor filter. */
  actors(): Promise<{ id: string; email: string | null }[]>;
}
