import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromDbDate, toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let userId: string;
let scopeId: string;
beforeAll(async () => {
  t = await createTestDb();
  userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Author",
      email: "author@example.com",
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  scopeId = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id: scopeId,
      name: "team",
      description: "A team.",
      created_by: null,
      created_at: now(),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
});
afterAll(() => t.cleanup());

const now = () => toDbDate(new Date(), t.dialect);

const insertRevision = async () => {
  const submissionId = newId();
  await t.db
    .insertInto("submissions")
    .values({
      id: submissionId,
      author_id: userId,
      scope_id: scopeId,
      name: "tidy",
      type: "skill",
      item_id: null,
      base_version_id: null,
      status: "submitted",
      created_at: now(),
      updated_at: now(),
      submitted_at: now(),
    })
    .execute();
  const id = newId();
  await t.db
    .insertInto("submission_revisions")
    .values({ id, submission_id: submissionId, number: 1, created_by: userId, created_at: now() })
    .execute();
  return { submissionId, revisionId: id };
};

const queue = async (revisionId: string, queuedAt = new Date()) => {
  const id = newId();
  await t.db
    .insertInto("content_scans")
    .values({
      id,
      revision_id: revisionId,
      scanner: "skillspector",
      status: "queued",
      queued_at: toDbDate(queuedAt, t.dialect),
    })
    .execute();
  return id;
};

describe("0038_content_scans", () => {
  it("goes with its revision", async () => {
    expect(await foreignKeys(t.db, t.dialect, ["content_scans"])).toEqual([
      { table: "content_scans", references: "submission_revisions", onDelete: "CASCADE" },
    ]);
    const { submissionId, revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    await t.db.deleteFrom("submissions").where("id", "=", submissionId).execute();
    expect(
      await t.db.selectFrom("content_scans").select("id").where("id", "=", scan).execute(),
    ).toEqual([]);
  });

  it("refuses a scan of a revision that doesn't exist", async () => {
    await expect(queue(newId())).rejects.toThrow();
  });

  it("starts queued with no result, attempts 0 and nothing omitted", async () => {
    const { revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    const row = await t.db
      .selectFrom("content_scans")
      .selectAll()
      .where("id", "=", scan)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      status: "queued",
      attempts: 0,
      scanner_version: null,
      score: null,
      severity: null,
      recommendation: null,
      complete: null,
      analysis: null,
      llm_note: null,
      llm_provider: null,
      llm_model: null,
      findings: null,
      findings_omitted: 0,
      error: null,
      started_at: null,
      finished_at: null,
    });
  });

  it("stores a done scan with findings longer than MySQL's text", async () => {
    const { revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    // 200 findings of 500-character strings, the most parseSkillScan keeps.
    const findings = JSON.stringify(
      Array.from({ length: 200 }, (_, i) => ({
        rule: `R${i}`,
        title: "é".repeat(500),
        explanation: "x".repeat(500),
      })),
    );
    expect(findings.length).toBeGreaterThan(65_535);
    const finishedAt = new Date("2026-10-28T12:00:00.123Z");
    await t.db
      .updateTable("content_scans")
      .set({
        status: "done",
        attempts: 1,
        scanner_version: "2.13.2",
        score: 100,
        severity: "CRITICAL",
        recommendation: "DO_NOT_INSTALL",
        complete: toDbBoolean(true, t.dialect),
        analysis: "semantic",
        llm_note: null,
        llm_provider: "ollama",
        llm_model: "qwen3-coder:30b",
        findings,
        findings_omitted: 9_800,
        started_at: toDbDate(finishedAt, t.dialect),
        finished_at: toDbDate(finishedAt, t.dialect),
      })
      .where("id", "=", scan)
      .execute();
    const row = await t.db
      .selectFrom("content_scans")
      .selectAll()
      .where("id", "=", scan)
      .executeTakeFirstOrThrow();
    expect(row.findings).toBe(findings);
    // SQLite and MySQL give 1, PostgreSQL true.
    expect(Boolean(row.complete)).toBe(true);
    expect(fromDbDate(row.finished_at)).toEqual(finishedAt);
    expect(row).toMatchObject({
      score: 100,
      severity: "CRITICAL",
      analysis: "semantic",
      llm_provider: "ollama",
      llm_model: "qwen3-coder:30b",
      findings_omitted: 9_800,
    });
  });

  it("holds the longest version, model and reason the code writes", async () => {
    const { revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    // parseSkillScan refuses a longer version; scanProvider cuts the model to 128; the longest
    // reason is `exit ` and a number. Multi-byte, so the columns count characters, not bytes.
    const version = "é".repeat(64);
    const model = "模".repeat(128);
    const error = `exit ${Number.MIN_SAFE_INTEGER}`;
    await t.db
      .updateTable("content_scans")
      .set({ scanner_version: version, llm_model: model, llm_provider: "openai_compatible", error })
      .where("id", "=", scan)
      .execute();
    const row = await t.db
      .selectFrom("content_scans")
      .select(["scanner_version", "llm_model", "llm_provider", "error"])
      .where("id", "=", scan)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      scanner_version: version,
      llm_model: model,
      llm_provider: "openai_compatible",
      error,
    });
  });

  it("keeps several scans of one revision, newest last by queued_at", async () => {
    const { revisionId } = await insertRevision();
    const first = await queue(revisionId, new Date("2026-10-28T10:00:00Z"));
    const second = await queue(revisionId, new Date("2026-10-28T11:00:00Z"));
    const rows = await t.db
      .selectFrom("content_scans")
      .select("id")
      .where("revision_id", "=", revisionId)
      .orderBy("queued_at")
      .orderBy("id")
      .execute();
    expect(rows.map((r) => r.id)).toEqual([first, second]);
  });
});
