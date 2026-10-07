import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { migrateToLatest } from "../migrate";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID, workspaces } from "./0019_workspaces";
import { migrations } from "./index";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
// Each test starts from an instance migrated up to 0018, with scopes and items in it, as an
// instance upgrading to this version would be.
let t: TestDb;
let userId: string;
const scopeIds: string[] = [];

const before = Object.fromEntries(
  Object.entries(migrations).filter(([name]) => name < "0019_workspaces"),
);

const now = () => toDbDate(new Date(), t.dialect);

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
  scopeIds.length = 0;
  for (const name of ["team", "infra"]) {
    const id = newId();
    scopeIds.push(id);
    // Without workspace_id: the column doesn't exist yet.
    await t.db
      .insertInto("scopes")
      .values({
        id,
        name,
        description: `The ${name} scope.`,
        created_by: userId,
        created_at: now(),
      } as never)
      .execute();
    await t.db
      .insertInto("items")
      .values({
        id: newId(),
        scope_id: id,
        name: "deploy",
        type: "skill",
        description: "A skill.",
        owner_id: userId,
        created_at: now(),
      })
      .execute();
  }
});
afterEach(() => t.cleanup());

describe("0019_workspaces", () => {
  it("creates the global workspace, public, with a fixed id", async () => {
    await migrateToLatest(t.db, t.dialect);
    const rows = await t.db.selectFrom("workspaces").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: GLOBAL_WORKSPACE_ID,
      name: "global",
      description: "Everyone on this instance",
      visibility: "public",
      created_by: null,
    });
    expect(Boolean(rows[0]?.is_global)).toBe(true);
  });

  it("moves every existing scope into global and keeps its columns and items", async () => {
    const scopesBefore = await t.db.selectFrom("scopes").selectAll().orderBy("id").execute();
    await migrateToLatest(t.db, t.dialect);
    const scopesAfter = await t.db.selectFrom("scopes").selectAll().orderBy("id").execute();
    expect(scopesAfter).toEqual(
      scopesBefore.map((s) => ({ ...s, workspace_id: GLOBAL_WORKSPACE_ID })),
    );
    const items = await t.db.selectFrom("items").select("scope_id").orderBy("scope_id").execute();
    expect(items.map((i) => i.scope_id)).toEqual([...scopeIds].sort());
  });

  it("has the foreign keys on every database: to workspaces RESTRICT, to user SET NULL", async () => {
    await migrateToLatest(t.db, t.dialect);
    const keys = await foreignKeys(t.db, t.dialect, ["scopes", "workspaces", "items"]);
    expect(keys.filter((k) => k.table === "scopes")).toEqual(
      expect.arrayContaining([
        { table: "scopes", references: "user", onDelete: "SET NULL" },
        { table: "scopes", references: "workspaces", onDelete: "RESTRICT" },
      ]),
    );
    expect(keys.filter((k) => k.table === "scopes")).toHaveLength(2);
    expect(keys.filter((k) => k.table === "workspaces")).toEqual([
      { table: "workspaces", references: "user", onDelete: "SET NULL" },
    ]);
    // The items still point at scopes after SQLite's rebuild.
    expect(keys.filter((k) => k.table === "items" && k.references === "scopes")).toEqual([
      { table: "items", references: "scopes", onDelete: "RESTRICT" },
    ]);
  });

  it("enforces the keys afterwards: a scope needs a real workspace, global can't go", async () => {
    await migrateToLatest(t.db, t.dialect);
    const insertScope = (workspaceId: string | null) =>
      t.db
        .insertInto("scopes")
        .values({
          id: newId(),
          name: `s-${newId().toLowerCase()}`,
          description: "",
          created_by: null,
          created_at: now(),
          workspace_id: workspaceId as string,
        })
        .execute();
    await expect(insertScope(null)).rejects.toThrow();
    await expect(insertScope(newId())).rejects.toThrow();
    await insertScope(GLOBAL_WORKSPACE_ID);
    await expect(
      t.db.deleteFrom("workspaces").where("id", "=", GLOBAL_WORKSPACE_ID).execute(),
    ).rejects.toThrow();
    // A scope with items still can't be deleted either.
    await expect(
      t.db
        .deleteFrom("scopes")
        .where("id", "=", scopeIds[0] ?? "")
        .execute(),
    ).rejects.toThrow();
  });

  it("refuses a second workspace with the same name", async () => {
    await migrateToLatest(t.db, t.dialect);
    await expect(
      t.db
        .insertInto("workspaces")
        .values({
          id: newId(),
          name: "global",
          description: "",
          visibility: "public",
          is_global: 0,
          created_by: null,
          created_at: now(),
          updated_at: now(),
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("keeps the scope names unique", async () => {
    await migrateToLatest(t.db, t.dialect);
    await expect(
      t.db
        .insertInto("scopes")
        .values({
          id: newId(),
          name: "team",
          description: "",
          created_by: null,
          created_at: now(),
          workspace_id: GLOBAL_WORKSPACE_ID,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("leaves SQLite's foreign keys on, with no violations", async () => {
    await migrateToLatest(t.db, t.dialect);
    if (t.dialect !== "sqlite") return;
    const on = await sql<{ foreign_keys: number }>`pragma foreign_keys`.execute(t.db);
    expect(on.rows[0]?.foreign_keys).toBe(1);
    const broken = await sql`pragma foreign_key_check`.execute(t.db);
    expect(broken.rows).toEqual([]);
  });

  it("on SQLite, a failed run changes nothing, and runs again once the data is fixed", async () => {
    if (t.dialect !== "sqlite") return;
    // An item whose scope is gone, as a database edited by hand might have.
    await sql`pragma foreign_keys = off`.execute(t.db);
    await t.db
      .insertInto("items")
      .values({
        id: "orphan",
        scope_id: "no-such-scope",
        name: "lost",
        type: "skill",
        description: "",
        owner_id: userId,
        created_at: now(),
      })
      .execute();
    await sql`pragma foreign_keys = on`.execute(t.db);
    const scopesBefore = await t.db.selectFrom("scopes").selectAll().orderBy("id").execute();

    await expect(migrateToLatest(t.db, t.dialect)).rejects.toThrow(/rows of items point at/);
    const tables = (await t.db.introspection.getTables()).map((table) => table.name);
    expect(tables).not.toContain("workspaces");
    expect(tables).not.toContain("scopes_new");
    expect(await t.db.selectFrom("scopes").selectAll().orderBy("id").execute()).toEqual(
      scopesBefore,
    );
    const on = await sql<{ foreign_keys: number }>`pragma foreign_keys`.execute(t.db);
    expect(on.rows[0]?.foreign_keys).toBe(1);

    await t.db.deleteFrom("items").where("id", "=", "orphan").execute();
    expect(await migrateToLatest(t.db, t.dialect)).toEqual([
      "0019_workspaces",
      "0020_workspace_members",
    ]);
  });

  it("on MySQL and MariaDB, where DDL commits as it goes, every step is safe to run again", async () => {
    if (t.dialect !== "mysql") return;
    await migrateToLatest(t.db, t.dialect);
    await workspaces(t.dialect).up(t.db as never);
    expect(await t.db.selectFrom("workspaces").select("id").execute()).toEqual([
      { id: GLOBAL_WORKSPACE_ID },
    ]);
    const keys = await foreignKeys(t.db, t.dialect, ["scopes"]);
    expect(keys.filter((k) => k.references === "workspaces")).toHaveLength(1);
  });
});
