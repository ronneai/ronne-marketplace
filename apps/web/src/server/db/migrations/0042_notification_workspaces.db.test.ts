import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedUser } from "../../domains/shelves/repositories/test-seed";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { createTestDb, type TestDb } from "../testing/test-db";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

describe("0042_notification_workspaces", () => {
  it("leaves existing rows without workspaces, and stores a list when given one", async () => {
    const u = await seedUser(t);
    const insert = (workspace_ids?: string) =>
      t.db
        .insertInto("notifications")
        .values({
          id: newId(),
          user_id: u,
          kind: "submission.approved",
          subject_type: "submission",
          subject_id: newId(),
          params: "{}",
          created_at: toDbDate(new Date(), t.dialect),
          ...(workspace_ids ? { workspace_ids } : {}),
        })
        .execute();
    await insert();
    await insert(JSON.stringify(["a", "b"]));
    const rows = await t.db
      .selectFrom("notifications")
      .select("workspace_ids")
      .orderBy("id")
      .execute();
    expect(rows.map((r) => r.workspace_ids)).toEqual([null, '["a","b"]']);
  });

  it("is already applied by migrating to the latest", async () => {
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
