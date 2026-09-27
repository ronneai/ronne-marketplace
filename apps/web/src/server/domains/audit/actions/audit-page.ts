import { isConfigured, loadConfig } from "../../../config";
import { getAppDb } from "../../../db/instance";
import type { AuditQuery } from "../repositories/audit-repository";
import { type AuditPage, listAuditActors, listAuditEvents } from "./audit";

/** The running server's audit log, for /admin/audit. Pages check that the viewer is root first. */
export async function appAuditPage(
  query: Omit<AuditQuery, "limit">,
): Promise<AuditPage & { actors: { id: string; email: string | null }[] }> {
  const config = loadConfig();
  if (!isConfigured(config)) return { events: [], nextCursor: null, actors: [] };
  const { db, dialect } = getAppDb(config.databaseUrl);
  const [page, actors] = await Promise.all([
    listAuditEvents(db, dialect, query),
    listAuditActors(db, dialect),
  ]);
  return { ...page, actors };
}
