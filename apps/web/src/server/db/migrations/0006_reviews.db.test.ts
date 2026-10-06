import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fromDbDate, toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { backfillRevisions } from "./0006_reviews";
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

const insertSubmission = async () => {
  const id = newId();
  await t.db
    .insertInto("submissions")
    .values({
      id,
      author_id: userId,
      scope_id: scopeId,
      name: "style",
      type: "rule",
      item_id: null,
      base_version_id: null,
      status: "submitted",
      created_at: now(),
      updated_at: now(),
      submitted_at: now(),
    })
    .execute();
  return id;
};

const insertRevision = async (submissionId: string, number: number) => {
  const id = newId();
  await t.db
    .insertInto("submission_revisions")
    .values({ id, submission_id: submissionId, number, created_by: userId, created_at: now() })
    .execute();
  return id;
};

describe("0006_reviews", () => {
  it("creates real foreign keys: submissions cascade, users restrict", async () => {
    const keys = await foreignKeys(t.db, t.dialect, [
      "submission_revisions",
      "submission_revision_files",
      "review_events",
    ]);
    expect(
      keys.sort((a, b) => `${a.table}${a.references}`.localeCompare(`${b.table}${b.references}`)),
    ).toEqual([
      { table: "review_events", references: "submissions", onDelete: "CASCADE" },
      { table: "review_events", references: "user", onDelete: "RESTRICT" },
      {
        table: "submission_revision_files",
        references: "submission_revisions",
        onDelete: "CASCADE",
      },
      { table: "submission_revisions", references: "submissions", onDelete: "CASCADE" },
      { table: "submission_revisions", references: "user", onDelete: "RESTRICT" },
    ]);
  });

  it("keeps revision numbers unique per submission", async () => {
    const submission = await insertSubmission();
    await insertRevision(submission, 1);
    await insertRevision(submission, 2);
    await expect(insertRevision(submission, 2)).rejects.toThrow();
    // Another submission has its own numbering.
    await insertRevision(await insertSubmission(), 1);
  });

  it("deletes revisions, their files and the conversation with the submission", async () => {
    const submission = await insertSubmission();
    const revision = await insertRevision(submission, 1);
    await t.db
      .insertInto("submission_revision_files")
      .values({
        revision_id: revision,
        path: "README.md",
        encoding: "utf8",
        content: "Hi",
        size: 2,
        executable: toDbBoolean(false, t.dialect),
      })
      .execute();
    await t.db
      .insertInto("review_events")
      .values({
        id: newId(),
        submission_id: submission,
        actor_id: userId,
        kind: "comment",
        body: "Looks good.",
        revision: 1,
        created_at: now(),
      })
      .execute();

    await t.db.deleteFrom("submissions").where("id", "=", submission).execute();
    const count = async (table: "submission_revisions" | "review_events") =>
      (await t.db.selectFrom(table).select("id").where("submission_id", "=", submission).execute())
        .length;
    expect(await count("submission_revisions")).toBe(0);
    expect(await count("review_events")).toBe(0);
    const files = await t.db
      .selectFrom("submission_revision_files")
      .select("path")
      .where("revision_id", "=", revision)
      .execute();
    expect(files).toEqual([]);
  });

  it("refuses to delete a user who wrote a review event", async () => {
    const submission = await insertSubmission();
    const reviewer = newId();
    await t.db
      .insertInto("user")
      .values({
        id: reviewer,
        name: "Reviewer",
        email: "reviewer@example.com",
        email_verified: 0,
        image: null,
        created_at: now(),
        updated_at: now(),
        disabled_at: null,
      })
      .execute();
    await t.db
      .insertInto("review_events")
      .values({
        id: newId(),
        submission_id: submission,
        actor_id: reviewer,
        kind: "approve",
        body: null,
        revision: 1,
        created_at: now(),
      })
      .execute();
    await expect(t.db.deleteFrom("user").where("id", "=", reviewer).execute()).rejects.toThrow();
  });

  it("backfills revision 1 and a submit event for submissions sent before it, once", async () => {
    // A submission from 013: submitted, with its files, but no revision.
    const submission = await insertSubmission();
    const submittedAt = new Date("2026-09-27T12:00:00.000Z");
    await t.db
      .updateTable("submissions")
      .set({ submitted_at: toDbDate(submittedAt, t.dialect) })
      .where("id", "=", submission)
      .execute();
    await t.db
      .insertInto("submission_files")
      .values([
        {
          submission_id: submission,
          path: "ronne.yaml",
          encoding: "utf8",
          content: "name: x\n",
          size: 8,
          executable: toDbBoolean(false, t.dialect),
          updated_at: now(),
        },
        {
          submission_id: submission,
          path: "run.sh",
          encoding: "utf8",
          content: "#!/bin/sh\n",
          size: 10,
          executable: toDbBoolean(true, t.dialect),
          updated_at: now(),
        },
      ])
      .execute();
    // A draft is left alone.
    const draft = newId();
    await t.db
      .insertInto("submissions")
      .values({
        id: draft,
        author_id: userId,
        scope_id: scopeId,
        name: "draft",
        type: "rule",
        item_id: null,
        base_version_id: null,
        status: "draft",
        created_at: now(),
        updated_at: now(),
        submitted_at: null,
      })
      .execute();

    const created = await backfillRevisions(t.db);
    expect(created).toBeGreaterThanOrEqual(1);
    const revisions = await t.db
      .selectFrom("submission_revisions")
      .selectAll()
      .where("submission_id", "=", submission)
      .execute();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ number: 1, created_by: userId });
    expect(fromDbDate(revisions[0]?.created_at ?? "").toISOString()).toBe(
      submittedAt.toISOString(),
    );
    const files = await t.db
      .selectFrom("submission_revision_files")
      .select(["path", "executable"])
      .where("revision_id", "=", revisions[0]?.id ?? "")
      .orderBy("path")
      .execute();
    expect(files.map((f) => [f.path, Boolean(f.executable)])).toEqual([
      ["ronne.yaml", false],
      ["run.sh", true],
    ]);
    const events = await t.db
      .selectFrom("review_events")
      .select(["kind", "revision"])
      .where("submission_id", "=", submission)
      .execute();
    expect(events).toEqual([{ kind: "submit", revision: 1 }]);
    const drafts = await t.db
      .selectFrom("submission_revisions")
      .select("id")
      .where("submission_id", "=", draft)
      .execute();
    expect(drafts).toEqual([]);

    // Running it again changes nothing.
    expect(await backfillRevisions(t.db)).toBe(0);
  });
});
