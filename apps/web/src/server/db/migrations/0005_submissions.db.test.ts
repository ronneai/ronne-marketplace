import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.cleanup());

const now = () => toDbDate(new Date(), t.dialect);

const insertUser = async (email: string) => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: "Author",
      email,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  return id;
};

const insertScope = async (name: string) => {
  const id = newId();
  await t.db
    .insertInto("scopes")
    .values({ id, name, description: "A scope.", created_by: null, created_at: now() })
    .execute();
  return id;
};

const insertSubmission = async (authorId: string, scopeId: string) => {
  const id = newId();
  await t.db
    .insertInto("submissions")
    .values({
      id,
      author_id: authorId,
      scope_id: scopeId,
      name: "code-reviewer",
      type: "agent",
      item_id: null,
      base_version_id: null,
      status: "draft",
      created_at: now(),
      updated_at: now(),
      submitted_at: null,
    })
    .execute();
  return id;
};

const insertFile = (
  submissionId: string,
  path: string,
  content: string,
  encoding: "utf8" | "base64" = "utf8",
  size = content.length,
) =>
  t.db
    .insertInto("submission_files")
    .values({
      submission_id: submissionId,
      path,
      encoding,
      content,
      size,
      executable: toDbBoolean(false, t.dialect),
      updated_at: now(),
    })
    .execute();

const readFile = (submissionId: string, path: string) =>
  t.db
    .selectFrom("submission_files")
    .selectAll()
    .where("submission_id", "=", submissionId)
    .where("path", "=", path)
    .executeTakeFirstOrThrow();

describe("0005_submissions", () => {
  it("creates real foreign keys: author and scope restrict, files cascade", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["submissions", "submission_files"]);
    expect(
      keys.sort((a, b) => `${a.table}${a.references}`.localeCompare(`${b.table}${b.references}`)),
    ).toEqual([
      { table: "submission_files", references: "submissions", onDelete: "CASCADE" },
      { table: "submissions", references: "scopes", onDelete: "RESTRICT" },
      { table: "submissions", references: "user", onDelete: "RESTRICT" },
    ]);
  });

  it("refuses to delete a user or scope that has submissions", async () => {
    const author = await insertUser("restrict@example.com");
    const scope = await insertScope("restrict");
    await insertSubmission(author, scope);
    await expect(t.db.deleteFrom("user").where("id", "=", author).execute()).rejects.toThrow();
    await expect(t.db.deleteFrom("scopes").where("id", "=", scope).execute()).rejects.toThrow();
  });

  it("deletes a submission's files with it", async () => {
    const id = await insertSubmission(
      await insertUser("cascade@example.com"),
      await insertScope("cascade"),
    );
    await insertFile(id, "ronne.yaml", "name: x\n");
    await t.db.deleteFrom("submissions").where("id", "=", id).execute();
    const left = await t.db
      .selectFrom("submission_files")
      .select("path")
      .where("submission_id", "=", id)
      .execute();
    expect(left).toEqual([]);
  });

  it("refuses the same path twice in one submission", async () => {
    const id = await insertSubmission(await insertUser("pk@example.com"), await insertScope("pk"));
    await insertFile(id, "prompt.md", "one");
    await expect(insertFile(id, "prompt.md", "two")).rejects.toThrow();
  });

  it("tells paths apart by case and accents on every database", async () => {
    const id = await insertSubmission(
      await insertUser("case@example.com"),
      await insertScope("case"),
    );
    for (const path of ["README.md", "readme.md", "e.md", "é.md"]) await insertFile(id, path, path);
    expect((await readFile(id, "readme.md")).content).toBe("readme.md");
    expect((await readFile(id, "é.md")).content).toBe("é.md");
  });

  it("stores a 1 MB text file and a 1 MB binary file unchanged", async () => {
    const id = await insertSubmission(
      await insertUser("big@example.com"),
      await insertScope("big"),
    );
    // Multi-byte characters too, so MySQL's utf8mb4 and longtext both matter.
    const text = "é🙂 line of text\n".repeat(Math.floor((1024 * 1024) / 20));
    await insertFile(id, "big.md", text);
    expect((await readFile(id, "big.md")).content).toBe(text);

    const bytes = randomBytes(1024 * 1024);
    await insertFile(id, "big.bin", bytes.toString("base64"), "base64", bytes.length);
    const row = await readFile(id, "big.bin");
    expect(Buffer.from(row.content, "base64").equals(bytes)).toBe(true);
    expect(row.size).toBe(1024 * 1024);
  });

  it("keeps the executable flag", async () => {
    const id = await insertSubmission(
      await insertUser("exec@example.com"),
      await insertScope("exec"),
    );
    await t.db
      .insertInto("submission_files")
      .values({
        submission_id: id,
        path: "bin/run.sh",
        encoding: "utf8",
        content: "#!/bin/sh\n",
        size: 10,
        executable: toDbBoolean(true, t.dialect),
        updated_at: now(),
      })
      .execute();
    expect(Boolean((await readFile(id, "bin/run.sh")).executable)).toBe(true);
  });
});
