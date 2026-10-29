import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
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

const dismiss = async (scanId: string, finding: number, reason = "A false alarm.") => {
  const id = newId();
  await t.db
    .insertInto("scan_dismissals")
    .values({ id, scan_id: scanId, finding, user_id: userId, reason, created_at: now() })
    .execute();
  return id;
};

describe("0039_scan_dismissals", () => {
  it("goes with its scan, and keeps its reviewer", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["scan_dismissals"]);
    // Each database lists them in its own order.
    expect(keys.sort((a, b) => a.references.localeCompare(b.references))).toEqual([
      { table: "scan_dismissals", references: "content_scans", onDelete: "CASCADE" },
      { table: "scan_dismissals", references: "user", onDelete: "RESTRICT" },
    ]);
    const { submissionId, revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    const dismissal = await dismiss(scan, 0);
    await t.db.deleteFrom("submissions").where("id", "=", submissionId).execute();
    expect(
      await t.db.selectFrom("scan_dismissals").select("id").where("id", "=", dismissal).execute(),
    ).toEqual([]);
  });

  it("dismisses a finding of a scan once", async () => {
    const { revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    await dismiss(scan, 3);
    await expect(dismiss(scan, 3)).rejects.toThrow();
    await dismiss(scan, 4);
    // The same position in another scan is another finding.
    await dismiss(await queue(revisionId), 3);
  });

  it("keeps a long plain-text reason whole", async () => {
    const { revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    const reason = "é😀\n".repeat(160);
    const id = await dismiss(scan, 0, reason);
    const row = await t.db
      .selectFrom("scan_dismissals")
      .select("reason")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(row.reason).toBe(reason);
  });

  it("refuses a dismissal of a scan that doesn't exist", async () => {
    await expect(dismiss(newId(), 0)).rejects.toThrow();
  });
});

describe("0040_scan_dismissal_kind", () => {
  it("makes every mark a false positive unless it says it's an accepted risk", async () => {
    const { revisionId } = await insertRevision();
    const scan = await queue(revisionId);
    const plain = await dismiss(scan, 0);
    const accepted = newId();
    await t.db
      .insertInto("scan_dismissals")
      .values({
        id: accepted,
        scan_id: scan,
        finding: 1,
        user_id: userId,
        reason: "Known.",
        kind: "accepted",
        created_at: now(),
      })
      .execute();
    const rows = await t.db
      .selectFrom("scan_dismissals")
      .select(["id", "kind"])
      .where("id", "in", [plain, accepted])
      .execute();
    expect(Object.fromEntries(rows.map((r) => [r.id, r.kind]))).toEqual({
      [plain]: "false_positive",
      [accepted]: "accepted",
    });
  });
});
