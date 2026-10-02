import { isConfigured, loadConfig } from "../../../config";
import { getAppDb } from "../../../db/instance";
import type { AuditEvent } from "../models/audit-event";
import type { AuditQuery } from "../repositories/audit-repository";
import { type AuditPage, countAuditEvents, findAuditEvent, listAuditEvents } from "./audit";

export type AuditPageWithTotal = AuditPage & { total: { count: number; capped: boolean } };

/**
 * The running server's audit log, for /admin/audit: one page and the capped count of everything
 * the filters match, read together (060). Pages check that the viewer is root first.
 */
export const appAuditPage = async (query: AuditQuery): Promise<AuditPageWithTotal> => {
  const config = loadConfig();
  if (!isConfigured(config))
    return { events: [], next: null, previous: null, total: { count: 0, capped: false } };
  const { db, dialect } = getAppDb(config.databaseUrl);
  const { sort: _sort, dir: _dir, size: _size, cursor: _cursor, ...filters } = query;
  const [page, total] = await Promise.all([
    listAuditEvents(db, dialect, query),
    countAuditEvents(db, dialect, filters),
  ]);
  return { ...page, total };
};

/** One event of the running server's audit log, for the details dialog. */
export const appAuditEvent = async (id: string): Promise<AuditEvent | null> => {
  const config = loadConfig();
  if (!isConfigured(config)) return null;
  const { db, dialect } = getAppDb(config.databaseUrl);
  return findAuditEvent(db, dialect, id);
};
