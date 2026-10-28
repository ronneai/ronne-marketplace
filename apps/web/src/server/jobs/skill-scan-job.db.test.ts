import { mkdirSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../db/dates";
import { newId } from "../db/ids";
import { GLOBAL_WORKSPACE_ID } from "../db/migrations/0019_workspaces";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { runSkillScansOn, SKILL_SCAN_JOB } from "./skill-scan-job";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let revisionId: string;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

const now = () => toDbDate(new Date(), t.dialect);

beforeEach(async () => {
  const userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Author",
      email: `${userId}@example.com`,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  const scopeId = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id: scopeId,
      name: `s${scopeId.slice(-6).toLowerCase()}`,
      description: "A scope.",
      created_by: null,
      created_at: now(),
      workspace_id: GLOBAL_WORKSPACE_ID,
    })
    .execute();
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
  revisionId = newId();
  await t.db
    .insertInto("submission_revisions")
    .values({
      id: revisionId,
      submission_id: submissionId,
      number: 1,
      created_by: userId,
      created_at: now(),
    })
    .execute();
});

const scan = async (status: "queued" | "running", startedAgoMs: number | null = null) => {
  await t.db
    .insertInto("content_scans")
    .values({
      id: newId(),
      revision_id: revisionId,
      scanner: "skillspector",
      status,
      attempts: status === "running" ? 1 : 0,
      queued_at: now(),
      started_at:
        startedAgoMs === null ? null : toDbDate(new Date(Date.now() - startedAgoMs), t.dialect),
    })
    .execute();
};

const jobRuns = async () =>
  (await t.db.selectFrom("jobs").select("name").where("name", "=", SKILL_SCAN_JOB).execute())
    .length;

// No command: whatever runs fails `not configured`, which is enough to see that it ran.
const config = { env: {} };

describe("runSkillScansOn (135)", () => {
  it("takes no lease when nothing waits", async () => {
    await t.db.deleteFrom("content_scans").execute();
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toBeNull();
    expect(await jobRuns()).toBe(0);
  });

  it("runs the job when a scan waits", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await scan("queued");
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toMatchObject({
      status: "done",
      counts: { failed: 1 },
    });
  });

  it("runs the job for a scan stuck since Ronne died, with nothing else waiting", async () => {
    await t.db.deleteFrom("content_scans").execute();
    // Twice the default 300-second timeout, and then some.
    await scan("running", 3 * 3_600_000);
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toMatchObject({
      status: "done",
    });
    const row = await t.db.selectFrom("content_scans").select("status").executeTakeFirstOrThrow();
    expect(row.status).not.toBe("running");
  });

  it("counts a scan running just past twice the timeout as stuck", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await scan("running", 610_000);
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).not.toBeNull();
  });

  it("leaves a scan running for less than twice the timeout alone", async () => {
    await t.db.deleteFrom("content_scans").execute();
    await scan("running", 590_000);
    expect(await runSkillScansOn({ db: t.db, dialect: t.dialect }, config)).toBeNull();
  });

  it("sweeps a folder a dead process left, even with nothing to scan", async () => {
    await t.db.deleteFrom("content_scans").execute();
    const name = `ronne-scan-${newId().slice(-6)}`;
    const folder = join(tmpdir(), name);
    mkdirSync(folder);
    const long = new Date(Date.now() - 3 * 3_600_000);
    utimesSync(folder, long, long);
    await runSkillScansOn({ db: t.db, dialect: t.dialect }, config);
    expect(readdirSync(tmpdir())).not.toContain(name);
  });
});
