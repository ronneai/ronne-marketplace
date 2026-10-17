import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { isUniqueViolation } from "../locks";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
const now = () => toDbDate(new Date(), t.dialect);

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const insertUser = async (email: string) => {
  const id = newId();
  await t.db
    .insertInto("user")
    .values({
      id,
      name: email,
      email,
      email_verified: 0,
      image: null,
      created_at: now(),
      updated_at: now(),
      role: "root",
      disabled_at: null,
    })
    .execute();
  return id;
};

const insertProvider = (id: string, fields: Record<string, unknown> = {}) =>
  t.db
    .insertInto("identity_providers")
    .values({
      id,
      type: "oidc",
      preset: "okta",
      name: "Acme",
      config: "{}",
      secret_enc: null,
      domains: "[]",
      groups_claim: null,
      tested_at: null,
      tested_by: null,
      last_signed_in_at: null,
      last_failure_at: null,
      last_failure_reason: null,
      created_by: null,
      created_at: now(),
      updated_at: now(),
      ...fields,
    })
    .execute();

const insertWorkspace = async () => {
  const id = newId();
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name: `team-${id.slice(-6).toLowerCase()}`,
      description: "A team.",
      visibility: "public",
      is_global: 0,
      owner_id: null,
      created_by: null,
      created_at: now(),
      updated_at: now(),
    } as never)
    .execute();
  return id;
};

describe("0026_identity_providers", () => {
  it("declares its foreign keys on every database", async () => {
    const keys = await foreignKeys(t.db, t.dialect, [
      "identity_providers",
      "provider_group_mappings",
    ]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "identity_providers", references: "user", onDelete: "SET NULL" },
        { table: "provider_group_mappings", references: "identity_providers", onDelete: "CASCADE" },
        { table: "provider_group_mappings", references: "workspaces", onDelete: "SET NULL" },
      ]),
    );
    expect(keys).toHaveLength(4);
  });

  it("makes a provider off, linking by email, with no failures, by default", async () => {
    await insertProvider("acme");
    const row = await t.db.selectFrom("identity_providers").selectAll().executeTakeFirstOrThrow();
    expect(Boolean(row.enabled)).toBe(false);
    expect(Boolean(row.link_by_email)).toBe(true);
    expect(Number(row.failures)).toBe(0);
  });

  it("refuses a second provider with the same id", async () => {
    await insertProvider("acme");
    await insertProvider("acme").then(
      () => expect.fail("a duplicate id was stored"),
      (error) => expect(isUniqueViolation(error)).toBe(true),
    );
  });

  it("keeps a 32-character id and a long client secret", async () => {
    const id = "x".repeat(32);
    await insertProvider(id, { secret_enc: `v1.${"a".repeat(16)}.${"b".repeat(4000)}` });
    const row = await t.db
      .selectFrom("identity_providers")
      .select(["id", "secret_enc"])
      .executeTakeFirstOrThrow();
    expect(row.id).toBe(id);
    expect(row.secret_enc).toHaveLength(4020);
  });

  it("forgets who tested or created it when that user is deleted", async () => {
    const user = await insertUser("root@example.com");
    await insertProvider("acme", { tested_by: user, created_by: user, tested_at: now() });
    await t.db.deleteFrom("user").where("id", "=", user).execute();
    const row = await t.db
      .selectFrom("identity_providers")
      .select(["tested_by", "created_by"])
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ tested_by: null, created_by: null });
  });

  it("deletes a provider's group mappings with it, and keeps a mapping whose workspace went (null)", async () => {
    await insertProvider("acme");
    const ws = await insertWorkspace();
    for (const [group, workspace] of [
      ["Admins", ws],
      ["admins", GLOBAL_WORKSPACE_ID],
    ] as const)
      await t.db
        .insertInto("provider_group_mappings")
        .values({
          id: newId(),
          provider_id: "acme",
          group_name: group,
          workspace_id: workspace,
          role: "admin",
          created_at: now(),
        })
        .execute();
    // Groups are compared byte for byte, MySQL included.
    const exact = await t.db
      .selectFrom("provider_group_mappings")
      .select("group_name")
      .where("group_name", "=", "admins")
      .execute();
    expect(exact).toEqual([{ group_name: "admins" }]);

    await t.db.deleteFrom("workspaces").where("id", "=", ws).execute();
    const left = await t.db
      .selectFrom("provider_group_mappings")
      .select(["group_name", "workspace_id"])
      .orderBy("group_name")
      .execute();
    expect(left).toContainEqual({ group_name: "Admins", workspace_id: null });

    await t.db.deleteFrom("identity_providers").where("id", "=", "acme").execute();
    expect(await t.db.selectFrom("provider_group_mappings").selectAll().execute()).toEqual([]);
  });

  it("gives workspace_members a source, null unless a provider gave the membership", async () => {
    const user = await insertUser("ann@example.com");
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: GLOBAL_WORKSPACE_ID,
        user_id: user,
        role: "user",
        added_by: null,
        created_at: now(),
        updated_at: now(),
      })
      .execute();
    const ws = await insertWorkspace();
    await t.db
      .insertInto("workspace_members")
      .values({
        workspace_id: ws,
        user_id: user,
        role: "moderator",
        added_by: null,
        source: "acme",
        created_at: now(),
        updated_at: now(),
      })
      .execute();
    const rows = await t.db
      .selectFrom("workspace_members")
      .select(["workspace_id", "source"])
      .where("user_id", "=", user)
      .execute();
    expect(rows).toContainEqual({ workspace_id: GLOBAL_WORKSPACE_ID, source: null });
    expect(rows).toContainEqual({ workspace_id: ws, source: "acme" });
  });
});
