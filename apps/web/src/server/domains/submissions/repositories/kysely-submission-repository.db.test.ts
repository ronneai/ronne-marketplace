import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { OPEN_STATUSES, type SubmissionStatus } from "../models/status";
import { kyselySubmissionRepository } from "./kysely-submission-repository";

let t: TestDb;
let scopeId: string;
let otherScopeId: string;
let authorId: string;
beforeAll(async () => {
  t = await createTestDb();
  const now = toDbDate(new Date(), t.dialect);
  authorId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: authorId,
      name: "Author",
      email: "author@example.com",
      email_verified: 0,
      image: null,
      created_at: now,
      updated_at: now,
      disabled_at: null,
    })
    .execute();
  [scopeId, otherScopeId] = [newId(), newId()];
  await t.db
    .insertInto("scopes")
    .values([
      { id: scopeId, name: "team", description: "A team.", created_by: null, created_at: now },
      {
        id: otherScopeId,
        name: "other",
        description: "Another.",
        created_by: null,
        created_at: now,
      },
    ])
    .execute();
});
afterAll(() => t.cleanup());

const submissionIn = async (scope: string, name: string, status: SubmissionStatus) => {
  const repo = kyselySubmissionRepository(t.db, t.dialect);
  const id = await repo.insert({
    authorId,
    scopeId: scope,
    name,
    type: "rule",
    status: "draft",
    createdAt: new Date(),
  });
  await t.db.updateTable("submissions").set({ status }).where("id", "=", id).execute();
  return id;
};

describe("isNameProposed", () => {
  it("finds open submissions of the same scope and name, never drafts, closed ones or itself", async () => {
    const repo = kyselySubmissionRepository(t.db, t.dialect);
    const mine = await submissionIn(scopeId, "style", "draft");
    const proposed = (except = mine) =>
      repo.isNameProposed(scopeId, "style", OPEN_STATUSES, except);

    expect(await proposed()).toBe(false);
    await submissionIn(scopeId, "style", "draft");
    await submissionIn(scopeId, "style", "withdrawn");
    await submissionIn(scopeId, "style", "rejected");
    await submissionIn(otherScopeId, "style", "submitted");
    await submissionIn(scopeId, "styles", "submitted");
    expect(await proposed()).toBe(false);

    for (const status of OPEN_STATUSES) {
      const id = await submissionIn(scopeId, "style", status);
      expect(await proposed(), status).toBe(true);
      // A submission never blocks itself.
      await t.db
        .updateTable("submissions")
        .set({ status: "withdrawn" })
        .where("id", "=", id)
        .execute();
    }
    const open = await submissionIn(scopeId, "style", "submitted");
    expect(await proposed(open)).toBe(false);
  });
});

describe("countDrafts", () => {
  it("counts only the author's drafts", async () => {
    const repo = kyselySubmissionRepository(t.db, t.dialect);
    const before = await repo.countDrafts(authorId);
    await submissionIn(scopeId, "counted", "draft");
    await submissionIn(otherScopeId, "counted", "draft");
    await submissionIn(scopeId, "sent", "submitted");
    await submissionIn(scopeId, "gone", "withdrawn");
    expect(await repo.countDrafts(authorId)).toBe(before + 2);
    expect(await repo.countDrafts("someone-else")).toBe(0);
  });
});
