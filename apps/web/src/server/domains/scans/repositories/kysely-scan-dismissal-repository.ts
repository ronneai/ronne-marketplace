import type { SkillScanFinding } from "@ronneai/core";
import type { Kysely } from "kysely";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson } from "../../../db/json";
import { forUpdate, isUniqueViolation, readCommittedTransaction } from "../../../db/locks";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import { recordAudit } from "../../audit/actions/audit";
import type { Dismissal, ScanDismissalRepository } from "./scan-dismissal-repository";

/** False positives on scans (137), in `scan_dismissals`. */
export const kyselyScanDismissalRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ScanDismissalRepository => ({
  // READ COMMITTED, so what's read after waiting for the scan's lock is what the other committed.
  transaction: (work) =>
    readCommittedTransaction(db, dialect).execute((trx) =>
      work(kyselyScanDismissalRepository(trx, dialect)),
    ),

  async lockScan(scanId) {
    await forUpdate(
      db.selectFrom("content_scans").select("id").where("id", "=", scanId),
      dialect,
    ).execute();
  },

  async target(scanId) {
    const row = await db
      .selectFrom("content_scans")
      .innerJoin("submission_revisions", "submission_revisions.id", "content_scans.revision_id")
      .innerJoin("submissions", "submissions.id", "submission_revisions.submission_id")
      .innerJoin("scopes", "scopes.id", "submissions.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .select([
        "content_scans.id as scan_id",
        "content_scans.status",
        "content_scans.findings",
        "submission_revisions.number",
        "submissions.id as submission_id",
        "submissions.author_id",
        "submissions.status as submission_status",
        "submissions.name",
        "scopes.name as scope_name",
        "workspaces.id as workspace_id",
        "workspaces.name as workspace_name",
      ])
      .where("content_scans.id", "=", scanId)
      .executeTakeFirst();
    if (!row) return null;
    return {
      scanId: row.scan_id,
      status: row.status,
      findings: decodeJson<SkillScanFinding[]>(row.findings) ?? [],
      revision: Number(row.number),
      submission: {
        id: row.submission_id,
        authorId: row.author_id,
        status: row.submission_status,
        name: row.name,
        scope: { name: row.scope_name },
        workspace: { id: row.workspace_id, name: row.workspace_name },
      },
    };
  },

  async dismissals(scanIds) {
    const byScan = new Map<string, Dismissal[]>();
    if (scanIds.length === 0) return byScan;
    const rows = await db
      .selectFrom("scan_dismissals")
      .leftJoin("user", "user.id", "scan_dismissals.user_id")
      .select([
        "scan_dismissals.scan_id",
        "scan_dismissals.finding",
        "scan_dismissals.reason",
        "scan_dismissals.user_id",
        "scan_dismissals.created_at",
        "user.name",
      ])
      .where("scan_dismissals.scan_id", "in", [...scanIds])
      .orderBy("scan_dismissals.finding")
      .execute();
    for (const row of rows) {
      const list = byScan.get(row.scan_id) ?? [];
      list.push({
        finding: Number(row.finding),
        reason: row.reason,
        by: { id: row.user_id, name: row.name ?? null },
        at: fromDbDate(row.created_at),
      });
      byScan.set(row.scan_id, list);
    }
    return byScan;
  },

  async dismiss({ scanId, finding, userId, reason, at }) {
    try {
      await db
        .insertInto("scan_dismissals")
        .values({
          id: newId(),
          scan_id: scanId,
          finding,
          user_id: userId,
          reason,
          created_at: toDbDate(at, dialect),
        })
        .execute();
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) return false;
      throw error;
    }
  },

  async restore(scanId, finding) {
    const result = await db
      .deleteFrom("scan_dismissals")
      .where("scan_id", "=", scanId)
      .where("finding", "=", finding)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  },

  async recordAudit(event, at) {
    await recordAudit(db, dialect, event, at);
  },
});
