import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import { workspaceMembers } from "./0020_workspace_members";
import { migrations } from "./index";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Each test starts from an instance migrated up to 0019, with a root, a moderator, a user and a
// disabled moderator, as an instance upgrading to this version would be.
let t: TestDb;
const ids: Record<"root" | "moderator" | "user" | "disabled", string> = {
  root: "",
  moderator: "",
  user: "",
  disabled: "",
};

const before = Object.fromEntries(
  Object.entries(migrations).filter(([name]) => name < "0020_workspace_members"),
);

const now = () => toDbDate(new Date(), t.dialect);

const addUser = async (key: keyof typeof ids, role: string, disabled = false) => {
  ids[key] = newId();
  await t.db
    .insertInto("user")
    .values({
      id: ids[key],
      name: key,
      email: `${key}@example.com`,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      role: role as never,
      disabled_at: disabled ? now() : null,
    })
    .execute();
};

const members = () =>
  t.db
    .selectFrom("workspace_members")
    .select(["workspace_id", "user_id", "role", "added_by"])
    .orderBy("user_id")
    .execute();

const roles = async () =>
  Object.fromEntries(
    (await t.db.selectFrom("user").select(["id", "role"]).execute()).map((u) => [u.id, u.role]),
  );

beforeEach(async () => {
  t = await createTestDb({ migrate: false });
  await migrateToLatest(t.db, t.dialect, before);
  await addUser("root", "root");
  await addUser("moderator", "moderator");
  await addUser("user", "user");
  await addUser("disabled", "moderator", true);
});
afterEach(() => t.cleanup());

describe("0020_workspace_members", () => {
  it("puts every user but roots in global, moderators as moderators", async () => {
    await migrateToLatest(t.db, t.dialect);
    const row = (key: keyof typeof ids, role: string) => ({
      workspace_id: GLOBAL_WORKSPACE_ID,
      user_id: ids[key],
      role,
      added_by: null,
    });
    expect(await members()).toEqual(
      [row("moderator", "moderator"), row("user", "user"), row("disabled", "moderator")].sort(
        (a, b) => (a.user_id < b.user_id ? -1 : 1),
      ),
    );
  });

  it("leaves only root and user in user.role", async () => {
    await migrateToLatest(t.db, t.dialect);
    expect(await roles()).toEqual({
      [ids.root]: "root",
      [ids.moderator]: "user",
      [ids.user]: "user",
      [ids.disabled]: "user",
    });
  });

  it("has the keys: cascade from workspaces and users, added_by sets null", async () => {
    await migrateToLatest(t.db, t.dialect);
    const keys = await foreignKeys(t.db, t.dialect, ["workspace_members"]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "workspace_members", references: "workspaces", onDelete: "CASCADE" },
        { table: "workspace_members", references: "user", onDelete: "CASCADE" },
        { table: "workspace_members", references: "user", onDelete: "SET NULL" },
      ]),
    );
    expect(keys).toHaveLength(3);
  });

  it("enforces them: one row per user and workspace, a real workspace, gone with the user", async () => {
    await migrateToLatest(t.db, t.dialect);
    const insert = (workspaceId: string, userId: string) =>
      t.db
        .insertInto("workspace_members")
        .values({
          workspace_id: workspaceId,
          user_id: userId,
          role: "user",
          added_by: null,
          created_at: now(),
          updated_at: now(),
        })
        .execute();
    await expect(insert(GLOBAL_WORKSPACE_ID, ids.user)).rejects.toThrow();
    await expect(insert(newId(), ids.root)).rejects.toThrow();
    await expect(insert(GLOBAL_WORKSPACE_ID, newId())).rejects.toThrow();
    await t.db.deleteFrom("user").where("id", "=", ids.user).execute();
    expect((await members()).map((m) => m.user_id)).not.toContain(ids.user);
  });

  it("is safe to run again: no duplicates, nothing changed", async () => {
    await migrateToLatest(t.db, t.dialect);
    const first = await members();
    await workspaceMembers(t.dialect).up(t.db as never);
    expect(await members()).toEqual(first);
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([]);
  });
});
