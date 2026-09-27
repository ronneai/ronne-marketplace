import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { type AuditEvent, type NewAuditEvent, validateAuditEvent } from "../models/audit-event";
import type { AuditQuery } from "../repositories/audit-repository";
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

export type AuditPage = { events: AuditEvent[]; nextCursor: string | null };

/** One page of events, newest first, with the cursor for the next page (null on the last). */
export const listAuditEvents = async (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
  query: Omit<AuditQuery, "limit"> & { limit?: number },
): Promise<AuditPage> => {
  const limit = query.limit ?? AUDIT_PAGE_SIZE;
  // One more than the page, to know whether another page exists without a count query.
  const rows = await kyselyAuditRepository(db, dialect).list({ ...query, limit: limit + 1 });
  const events = rows.slice(0, limit);
  return { events, nextCursor: rows.length > limit ? (events.at(-1)?.id ?? null) : null };
};

export const listAuditActors = (db: Kysely<Database>, dialect: DatabaseDialect) =>
  kyselyAuditRepository(db, dialect).actors();
