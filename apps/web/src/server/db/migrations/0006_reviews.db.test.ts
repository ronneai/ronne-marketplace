import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";

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
});
