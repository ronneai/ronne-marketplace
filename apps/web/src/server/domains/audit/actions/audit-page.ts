import { isConfigured, loadConfig } from "../../../config";
import { getAppDb } from "../../../db/instance";
import { requirePermission, type Subject } from "../../identity/models/permissions";
import type { AuditEvent } from "../models/audit-event";
import type { AuditQuery, AuditWorkspace } from "../repositories/audit-repository";
import { kyselyAuditRepository } from "../repositories/kysely-audit-repository";
import { type AuditPage, countAuditEvents, findAuditEvent, listAuditEvents } from "./audit";

export type AuditPageWithTotal = AuditPage & { total: { count: number; capped: boolean } };

/**
 * The running server's audit log, for /admin/audit: one page and the capped count of everything
 * the filters match, read together (060). Only for `audit.read` (166): the action checks it
 * itself, as well as the page.
 */
export const appAuditPage = async (
  viewer: Subject | null,
  query: AuditQuery,
): Promise<AuditPageWithTotal> => {
  requirePermission(viewer, "audit.read");
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

/** One event of the running server's audit log, for the details dialog (`audit.read`). */
export const appAuditEvent = async (
  viewer: Subject | null,
  id: string,
): Promise<AuditEvent | null> => {
  requirePermission(viewer, "audit.read");
  const config = loadConfig();
  if (!isConfigured(config)) return null;
  const { db, dialect } = getAppDb(config.databaseUrl);
  return findAuditEvent(db, dialect, id);
};

/** The workspaces the Workspace filter offers, deleted ones too (166; `audit.read`). */
export const appAuditWorkspaces = async (viewer: Subject | null): Promise<AuditWorkspace[]> => {
  requirePermission(viewer, "audit.read");
  const config = loadConfig();
  if (!isConfigured(config)) return [];
  const { db, dialect } = getAppDb(config.databaseUrl);
  return kyselyAuditRepository(db, dialect).workspaces();
};
