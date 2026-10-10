import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbBoolean, toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import { migrations } from "./index";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Each test starts from an instance migrated up to 0021, with a second workspace, scopes and items
// in both, as an instance upgrading to this version would be.
let t: TestDb;
let userId: string;
let acmeId: string;
const items = { global: "", deploy: "", build: "" };

const before = Object.fromEntries(
  Object.entries(migrations).filter(([name]) => name < "0022_workspace_in_names"),
);

const now = () => toDbDate(new Date(), t.dialect);

const addScope = async (workspaceId: string, name: string) => {
  const id = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id,
      name,
      description: `The ${name} scope.`,
      created_by: userId,
      created_at: now(),
      workspace_id: workspaceId,
    })
    .execute();
  return id;
};

const addItem = async (scopeId: string, name: string) => {
  const id = newId();
  await t.db
    .insertInto("items")
    .values({
      id,
      scope_id: scopeId,
      name,
      type: "skill",
      description: "A skill.",
      owner_id: userId,
      created_at: now(),
    })
    .execute();
  return id;
};

beforeEach(async () => {
  t = await createTestDb({ migrate: false });
  await migrateToLatest(t.db, t.dialect, before);
  userId = newId();
  await t.db
    .insertInto("user")
    .values({
      id: userId,
      name: "Root",
      email: "root@example.com",
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      disabled_at: null,
    })
    .execute();
  acmeId = newId();
  await t.db
    .insertInto("workspaces")
    .values({
      id: acmeId,
      name: "acme",
      description: "Acme's team.",
      visibility: "private",
      is_global: toDbBoolean(false, t.dialect),
      created_by: userId,
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  items.global = await addItem(await addScope(GLOBAL_WORKSPACE_ID, "team"), "lint");
  const infra = await addScope(acmeId, "infra");
  items.deploy = await addItem(infra, "deploy");
  items.build = await addItem(infra, "build");
});
afterEach(() => t.cleanup());

const aliases = () =>
  t.db.selectFrom("item_aliases").select(["name", "item_id", "reason"]).orderBy("name").execute();

describe("0022_workspace_in_names", () => {
  it("keeps every item's old name outside global as an alias, and none for global's", async () => {
    await migrateToLatest(t.db, t.dialect);
    expect(await aliases()).toEqual([
      { name: "@infra/build", item_id: items.build, reason: "migration" },
      { name: "@infra/deploy", item_id: items.deploy, reason: "migration" },
    ]);
  });

  it("lets two workspaces have a scope of the same name, but not one workspace twice", async () => {
    await migrateToLatest(t.db, t.dialect);
    await addScope(GLOBAL_WORKSPACE_ID, "infra");
    await addScope(acmeId, "team");
    await expect(addScope(acmeId, "infra")).rejects.toThrow();
    await expect(addScope(GLOBAL_WORKSPACE_ID, "team")).rejects.toThrow();
  });

  it("keeps scopes, their items and their foreign keys", async () => {
    await migrateToLatest(t.db, t.dialect);
    const scopes = await t.db.selectFrom("scopes").select(["name", "workspace_id"]).execute();
    expect(scopes).toHaveLength(2);
    // A scope still can't go while its items point at it.
    await expect(t.db.deleteFrom("scopes").where("name", "=", "infra").execute()).rejects.toThrow();
  });

  it("takes one alias per name, and drops an item's aliases with it", async () => {
    await migrateToLatest(t.db, t.dialect);
    await expect(
      t.db
        .insertInto("item_aliases")
        .values({ name: "@infra/deploy", item_id: items.build, reason: "move", created_at: now() })
        .execute(),
    ).rejects.toThrow();
    await t.db.deleteFrom("items").where("id", "=", items.deploy).execute();
    expect((await aliases()).map((row) => row.name)).toEqual(["@infra/build"]);
  });

  it("changes nothing when it runs again", async () => {
    await migrateToLatest(t.db, t.dialect);
    const first = await aliases();
    await migrations["0022_workspace_in_names"]?.(t.dialect).up(t.db);
    expect(await aliases()).toEqual(first);
  });
});
