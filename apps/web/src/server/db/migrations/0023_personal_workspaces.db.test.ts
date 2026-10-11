import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { createTestDb, type TestDb } from "../testing/test-db";
import { personalWorkspaces } from "./0023_personal_workspaces";
import { migrations } from "./index";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Each test starts from an instance migrated up to 0022, with users (root among them), a shared
// workspace called `ana` and a released version, as an instance upgrading to this version would be.
let t: TestDb;
const users: Record<string, string> = {};
let versionId: string;

const before = Object.fromEntries(
  Object.entries(migrations).filter(([name]) => name < "0023_personal_workspaces"),
);

const now = (offset = 0) => toDbDate(new Date(Date.UTC(2026, 9, 1) + offset), t.dialect);

const addUser = async (email: string, at: number, role: "root" | "user" = "user") => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: email,
      email,
      email_verified: 0,
      image: null,
      created_at: now(at),
      updated_at: now(at),
      disabled_at: null,
      role,
    })
    .execute();
  users[email] = id;
  return id;
};

beforeEach(async () => {
  t = await createTestDb({ migrate: false });
  await migrateToLatest(t.db, t.dialect, before);
  // Created in this order: the first of two with the same name gets it.
  await addUser("root@example.com", 0, "root");
  await addUser("Ana.Silva@acme.com", 1);
  await addUser("ana@b.com", 2);
  await addUser("ana@c.com", 3);
  await addUser("admin@x.com", 4);
  await t.db
    .insertInto("workspaces")
    .values({
      id: newId(),
      name: "ana",
      description: "A team called ana.",
      visibility: "public",
      is_global: toDbBoolean(false, t.dialect),
      created_by: null,
      created_at: now(),
      updated_at: now(),
    } as never)
    .execute();
  const scopeId = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id: scopeId,
      name: "team",
      description: "A scope.",
      created_by: null,
      created_at: now(),
      workspace_id: "00000000000000000000000000",
    })
    .execute();
  const itemId = newId();
  await t.db
    .insertInto("items")
    .values({
      id: itemId,
      scope_id: scopeId,
      name: "lint",
      type: "rule",
      description: "A rule.",
      owner_id: null,
      created_at: now(),
    })
    .execute();
  versionId = newId();
  await t.db
    .insertInto("item_versions")
    .values({
      id: versionId,
      item_id: itemId,
      version: "1.0.0",
      manifest: "{}",
      readme: null,
      files: "[]",
      notes: null,
      artifact_path: "team/lint/1.0.0.tgz",
      sha256: "0".repeat(64),
      size: 1,
      published_by: users["root@example.com"] ?? "",
      published_at: now(),
      deprecated_message: null,
      yanked_at: null,
      yank_reason: null,
      submission_id: null,
    } as never)
    .execute();
});
afterEach(() => t.cleanup());

/** Each user's personal workspaces, with their memberships, by email. */
const personal = async () => {
  const rows = await t.db
    .selectFrom("workspaces")
    .innerJoin("user", "user.id", "workspaces.owner_id")
    .leftJoin("workspace_members", (join) =>
      join
        .onRef("workspace_members.workspace_id", "=", "workspaces.id")
        .onRef("workspace_members.user_id", "=", "user.id"),
    )
    .select([
      "user.email as email",
      "workspaces.name as name",
      "workspaces.description as description",
      "workspaces.visibility as visibility",
      "workspace_members.role as role",
    ])
    .execute();
  // Sorted here: the databases' collations order `Ana.Silva` and `admin` differently.
  return rows.sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
};

describe("0023_personal_workspaces", () => {
  it("gives every user, root too, a private workspace named from the email, as its admin", async () => {
    await migrateToLatest(t.db, t.dialect);
    expect(await personal()).toEqual([
      {
        email: "Ana.Silva@acme.com",
        name: "ana-silva",
        description: "ana-silva's personal workspace",
        visibility: "private",
        role: "admin",
      },
      {
        email: "admin@x.com",
        name: "admin-2",
        description: "admin-2's personal workspace",
        visibility: "private",
        role: "admin",
      },
      // `ana` is a shared workspace's: the oldest user takes the next name.
      {
        email: "ana@b.com",
        name: "ana-2",
        description: "ana-2's personal workspace",
        visibility: "private",
        role: "admin",
      },
      {
        email: "ana@c.com",
        name: "ana-3",
        description: "ana-3's personal workspace",
        visibility: "private",
        role: "admin",
      },
      {
        email: "root@example.com",
        name: "root-2",
        description: "root-2's personal workspace",
        visibility: "private",
        role: "admin",
      },
    ]);
    // Nobody else is in them, and global and the shared workspace have no owner.
    const members = await t.db
      .selectFrom("workspace_members")
      .innerJoin("workspaces", "workspaces.id", "workspace_members.workspace_id")
      .select("workspace_members.user_id")
      .where("workspaces.owner_id", "is not", null)
      .execute();
    expect(members).toHaveLength(5);
    const shared = await t.db
      .selectFrom("workspaces")
      .select("name")
      .where("owner_id", "is", null)
      .orderBy("name")
      .execute();
    expect(shared.map((w) => w.name)).toEqual(["ana", "global"]);
  });

  it("changes nothing when it runs again", async () => {
    await migrateToLatest(t.db, t.dialect);
    const first = await personal();
    await personalWorkspaces(t.dialect).up(t.db as never);
    expect(await personal()).toEqual(first);
  });

  it("gives an owner left without their admin row by a stopped run that row on the next", async () => {
    await migrateToLatest(t.db, t.dialect);
    const ana = users["ana@b.com"] ?? "";
    await t.db.deleteFrom("workspace_members").where("user_id", "=", ana).execute();
    await personalWorkspaces(t.dialect).up(t.db as never);
    const rows = await t.db
      .selectFrom("workspace_members")
      .select("role")
      .where("user_id", "=", ana)
      .execute();
    expect(rows).toEqual([{ role: "admin" }]);
  });

  it("gives a user one personal workspace at most, and keeps the user while it exists", async () => {
    await migrateToLatest(t.db, t.dialect);
    const ana = users["ana@b.com"] ?? "";
    await expect(
      t.db
        .insertInto("workspaces")
        .values({
          id: newId(),
          name: "another",
          description: "Another.",
          visibility: "private",
          is_global: toDbBoolean(false, t.dialect),
          owner_id: ana,
          created_by: null,
          created_at: now(),
          updated_at: now(),
        })
        .execute(),
    ).rejects.toThrow();
    await t.db.deleteFrom("workspace_members").where("user_id", "=", ana).execute();
    await expect(t.db.deleteFrom("user").where("id", "=", ana).execute()).rejects.toThrow();
  });

  it("handles more users than one batch, all with the same name", async () => {
    const many = Array.from({ length: 1203 }, (_, i) => ({
      id: newId(),
      name: `Sam ${i}`,
      email: `sam@host${i}.example`,
      email_verified: 0,
      image: null,
      created_at: now(10 + i),
      updated_at: now(10 + i),
      disabled_at: null,
      role: "user" as const,
    }));
    for (let at = 0; at < many.length; at += 300)
      await t.db
        .insertInto("user")
        .values(many.slice(at, at + 300))
        .execute();
    await migrateToLatest(t.db, t.dialect);
    const names = new Set((await personal()).map((row) => row.name));
    expect(names.size).toBe(1203 + 5);
    for (const name of ["sam", "sam-2", "sam-1203"]) expect(names.has(name), name).toBe(true);
  });

  it("marks every version released so far as reviewed, and new ones too unless told", async () => {
    await migrateToLatest(t.db, t.dialect);
    const version = await t.db
      .selectFrom("item_versions")
      .select("reviewed")
      .where("id", "=", versionId)
      .executeTakeFirstOrThrow();
    expect(Boolean(version.reviewed)).toBe(true);
    // A version inserted without it is reviewed too.
    const copy = newId();
    await t.db
      .insertInto("item_versions")
      .values({
        ...(await t.db
          .selectFrom("item_versions")
          .selectAll()
          .where("id", "=", versionId)
          .executeTakeFirstOrThrow()),
        id: copy,
        version: "1.0.1",
        reviewed: undefined,
      } as never)
      .execute();
    const fresh = await t.db
      .selectFrom("item_versions")
      .select("reviewed")
      .where("id", "=", copy)
      .executeTakeFirstOrThrow();
    expect(Boolean(fresh.reviewed)).toBe(true);
  });
});
