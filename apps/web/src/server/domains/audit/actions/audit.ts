import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { type AuditEvent, type NewAuditEvent, validateAuditEvent } from "../models/audit-event";
import type { AuditFilters, AuditQuery } from "../repositories/audit-repository";
import { kyselyAuditRepository } from "../repositories/kysely-audit-repository";

export const AUDIT_PAGE_SIZE = 50;

/**
 * Records an event. Call it with the transaction of the change it describes, so a failed change
 * leaves no event and an event never exists without its change. Throws on an unknown action,
 * secret-looking metadata or metadata over 4 KB: those are bugs, not something to store.
 */
export const recordAudit = async (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  event: NewAuditEvent,
  now: Date = new Date(),
): Promise<string> => {
  const metadata = validateAuditEvent(event);
  return kyselyAuditRepository(db, dialect).insert({
    actorId: event.actorId,
    action: event.action,
    targetType: event.target.type,
    targetId: event.target.id ?? null,
    metadata,
    ipAddress: event.ipAddress ?? null,
    createdAt: now,
  });
};

export type AuditPage = { events: AuditEvent[]; next: string | null; previous: string | null };

/**
 * One page of events (keyset, 060): newest first unless sorted otherwise, AUDIT_PAGE_SIZE unless
 * told, with cursors for the pages either side (null at the ends).
 */
export const listAuditEvents = async (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  query: Partial<AuditQuery>,
): Promise<AuditPage> => {
  const { rows, next, previous } = await kyselyAuditRepository(db, dialect).list({
    ...query,
    sort: query.sort ?? "time",
    dir: query.dir ?? (query.sort === "action" ? "asc" : "desc"),
    size: query.size ?? AUDIT_PAGE_SIZE,
  });
  return { events: rows, next, previous };
};

/** How many events match the filters, exact up to the count cap. */
export const countAuditEvents = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  filters: AuditFilters,
) => kyselyAuditRepository(db, dialect).count(filters);

/** One event, for the details dialog; null when there's no such event. */
export const findAuditEvent = (db: Kysely<Database>, dialect: DatabaseDialect, id: string) =>
  kyselyAuditRepository(db, dialect).findById(id);
