import type { SkillScanFinding, SkillScanResult } from "@ronneai/core";
import type { Kysely, Selectable } from "kysely";
import { fromDbDate, toDbBoolean, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { decodeJson, encodeJson } from "../../../db/json";
import type { ContentScanTable, Database } from "../../../db/schema";
import { upsert } from "../../../db/upsert";
import type { DatabaseDialect } from "../../../db/url";
import {
  SKILL_SCAN_LAST_ERROR_KEY,
  SKILL_SCAN_LAST_VERSION_KEY,
} from "../../settings/models/skill-scan-policy";
import { fileBytes } from "../../submissions/models/submission";
import type { ScanError } from "../models/scan";
import type { ContentScan, ContentScanRepository } from "./content-scan-repository";

const toScan = (row: Selectable<ContentScanTable>): ContentScan => {
  const result: SkillScanResult | null =
    row.status === "done" &&
    row.score !== null &&
    row.severity !== null &&
    row.recommendation !== null
      ? {
          scanner: "skillspector",
          scannerVersion: row.scanner_version ?? "",
          analysis: row.analysis ?? "static",
          llmUnavailable: row.llm_note === "unavailable",
          score: row.score,
          severity: row.severity,
          recommendation: row.recommendation,
          complete: Boolean(row.complete),
          // Scans stored before 137 kept no remediation: they read as none.
          findings: (decodeJson<SkillScanFinding[]>(row.findings) ?? []).map((finding) => ({
            ...finding,
            remediation: finding.remediation ?? null,
          })),
          findingsOmitted: row.findings_omitted,
        }
      : null;
  return {
    id: row.id,
    revisionId: row.revision_id,
    status: row.status,
    attempts: row.attempts,
    result,
    llm: row.llm_provider ? { provider: row.llm_provider, model: row.llm_model } : null,
    error: row.error as ScanError | null,
    queuedAt: fromDbDate(row.queued_at),
    startedAt: fromDbDate(row.started_at),
    finishedAt: fromDbDate(row.finished_at),
  };
};

export const kyselyContentScanRepository = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ContentScanRepository => ({
  async queue(revisionId, at) {
    const id = newId();
    await db
      .insertInto("content_scans")
      .values({
        id,
        revision_id: revisionId,
        scanner: "skillspector",
        status: "queued",
        queued_at: toDbDate(at, dialect),
      })
      .execute();
    return id;
  },

  async takeNext(at) {
    // A few candidates, in case another taker got the first: the lease makes that rare.
    const candidates = await db
      .selectFrom("content_scans")
      .selectAll()
      .where("status", "=", "queued")
      .orderBy("queued_at")
      .orderBy("id")
      .limit(3)
      .execute();
    for (const row of candidates) {
      const taken = await db
        .updateTable("content_scans")
        .set({
          status: "running",
          attempts: row.attempts + 1,
          started_at: toDbDate(at, dialect),
        })
        .where("id", "=", row.id)
        .where("status", "=", "queued")
        .executeTakeFirst();
      if (Number(taken.numUpdatedRows) === 1) {
        return toScan({
          ...row,
          status: "running",
          attempts: row.attempts + 1,
          started_at: toDbDate(at, dialect),
        });
      }
    }
    return null;
  },

  async recoverStuck(before, maxAttempts, at) {
    const stuck = db
      .updateTable("content_scans")
      .where("status", "=", "running")
      .where("started_at", "<", toDbDate(before, dialect));
    const failed = await stuck
      .set({ status: "failed", error: "timeout", finished_at: toDbDate(at, dialect) })
      .where("attempts", ">=", maxAttempts)
      .executeTakeFirst();
    const requeued = await stuck
      .set({ status: "queued", started_at: null })
      .where("attempts", "<", maxAttempts)
      .executeTakeFirst();
    return { requeued: Number(requeued.numUpdatedRows), failed: Number(failed.numUpdatedRows) };
  },

  async putBack(id, maxAttempts) {
    const back = await db
      .updateTable("content_scans")
      .set({ status: "queued", started_at: null })
      .where("id", "=", id)
      .where("status", "=", "running")
      .where("attempts", "<", maxAttempts)
      .executeTakeFirst();
    return Number(back.numUpdatedRows) > 0;
  },

  async revisionFiles(revisionId) {
    const revision = await db
      .selectFrom("submission_revisions")
      .innerJoin("submissions", "submissions.id", "submission_revisions.submission_id")
      .select("submissions.status")
      .where("submission_revisions.id", "=", revisionId)
      .executeTakeFirst();
    if (!revision || revision.status === "withdrawn") return null;
    const rows = await db
      .selectFrom("submission_revision_files")
      .select(["path", "encoding", "content", "executable"])
      .where("revision_id", "=", revisionId)
      .orderBy("path")
      .execute();
    return rows.map((row) => ({
      path: row.path,
      bytes: fileBytes(row),
      executable: Boolean(row.executable),
    }));
  },

  async discard(id) {
    await db.deleteFrom("content_scans").where("id", "=", id).execute();
  },

  async hasWork(stuckBefore) {
    const row = await db
      .selectFrom("content_scans")
      .select("id")
      .where((eb) =>
        eb.or([
          eb("status", "=", "queued"),
          eb.and([
            eb("status", "=", "running"),
            eb("started_at", "<", toDbDate(stuckBefore, dialect)),
          ]),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return row !== undefined;
  },

  async finish(id, outcome, at) {
    const finishedAt = toDbDate(at, dialect);
    if (!outcome.ok) {
      await db
        .updateTable("content_scans")
        .set({ status: "failed", error: outcome.error, finished_at: finishedAt })
        .where("id", "=", id)
        .execute();
      return;
    }
    const { result, llm } = outcome;
    await db
      .updateTable("content_scans")
      .set({
        status: "done",
        scanner_version: result.scannerVersion,
        score: Math.round(result.score),
        severity: result.severity,
        recommendation: result.recommendation,
        complete: toDbBoolean(result.complete, dialect),
        analysis: result.analysis,
        llm_note: result.llmUnavailable ? "unavailable" : null,
        llm_provider: llm?.provider ?? null,
        llm_model: llm?.model ?? null,
        findings: encodeJson(result.findings),
        findings_omitted: result.findingsOmitted,
        error: null,
        finished_at: finishedAt,
      })
      .where("id", "=", id)
      .execute();
  },

  async latestFor(revisionIds) {
    const scans = new Map<string, ContentScan>();
    if (revisionIds.length === 0) return scans;
    const rows = await db
      .selectFrom("content_scans")
      .selectAll()
      .where("revision_id", "in", [...revisionIds])
      .orderBy("queued_at")
      .orderBy("id")
      .execute();
    // Oldest first, so the newest of each revision is the one left.
    for (const row of rows) scans.set(row.revision_id, toScan(row));
    return scans;
  },

  async recordLast(outcome, at) {
    const updatedAt = toDbDate(at, dialect);
    const set = (key: string, value: string) =>
      upsert(
        db,
        dialect,
        "instance_settings",
        { key, value, updated_by: null, updated_at: updatedAt },
        ["key"],
        ["value", "updated_by", "updated_at"],
      ).execute();
    if ("version" in outcome) {
      await set(SKILL_SCAN_LAST_VERSION_KEY, outcome.version);
      await set(SKILL_SCAN_LAST_ERROR_KEY, "");
    } else {
      await set(SKILL_SCAN_LAST_ERROR_KEY, outcome.error);
    }
  },
});
