import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import { workspaceAccessRequests } from "./0021_workspace_access_requests";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let userId: string;

const now = () => toDbDate(new Date(), t.dialect);

const insert = (workspaceId: string, user: string, decidedBy: string | null = null) =>
  t.db
    .insertInto("workspace_access_requests")
    .values({
      id: newId(),
      workspace_id: workspaceId,
      workspace_name: "global",
      user_id: user,
      message: "Let me in, please.",
      status: "open",
      decided_by: decidedBy,
      reason: null,
      created_at: now(),
      decided_at: null,
    })
    .execute();

const rows = () => t.db.selectFrom("workspace_access_requests").selectAll().execute();

beforeEach(async () => {
  t = await createTestDb();
  userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Uma",
      email: "u@example.com",
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      role: "user",
      disabled_at: null,
    })
    .execute();
});
afterEach(() => t.cleanup());

describe("0021_workspace_access_requests", () => {
  it("has the keys: cascade from workspaces and users, decided_by sets null", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["workspace_access_requests"]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "workspace_access_requests", references: "workspaces", onDelete: "CASCADE" },
        { table: "workspace_access_requests", references: "user", onDelete: "CASCADE" },
        { table: "workspace_access_requests", references: "user", onDelete: "SET NULL" },
      ]),
    );
    expect(keys).toHaveLength(3);
  });

  it("enforces them: a real workspace and user, gone with the user", async () => {
    await expect(insert(newId(), userId)).rejects.toThrow();
    await expect(insert(GLOBAL_WORKSPACE_ID, newId())).rejects.toThrow();
    await insert(GLOBAL_WORKSPACE_ID, userId);
    expect(await rows()).toHaveLength(1);
    await t.db.deleteFrom("user").where("id", "=", userId).execute();
    expect(await rows()).toEqual([]);
  });

  it("keeps a message of 500 characters in any script", async () => {
    const message = "ç日".repeat(250);
    await t.db
      .insertInto("workspace_access_requests")
      .values({
        id: newId(),
        workspace_id: GLOBAL_WORKSPACE_ID,
        workspace_name: "global",
        user_id: userId,
        message,
        status: "open",
        decided_by: null,
        reason: message,
        created_at: now(),
        decided_at: null,
      })
      .execute();
    expect((await rows())[0]).toMatchObject({ message, reason: message });
  });

  it("keeps a request to a name no workspace has, with no workspace", async () => {
    await t.db
      .insertInto("workspace_access_requests")
      .values({
        id: newId(),
        workspace_id: null,
        workspace_name: "nowhere",
        user_id: userId,
        message: null,
        status: "open",
        decided_by: null,
        reason: null,
        created_at: now(),
        decided_at: null,
      })
      .execute();
    expect(await rows()).toEqual([
      expect.objectContaining({ workspace_id: null, workspace_name: "nowhere" }),
    ]);
  });

  it("is safe to run again", async () => {
    await insert(GLOBAL_WORKSPACE_ID, userId);
    await workspaceAccessRequests(t.dialect).up(t.db as never);
    expect(await rows()).toHaveLength(1);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
