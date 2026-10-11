import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyItemRepository } from "../../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../domains/items/repositories/kysely-scope-repository";
import { UNFILTERED } from "../../domains/workspaces/models/viewer";
import { toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import { scopeMoves } from "./0024_scope_moves";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let userId: string;
let scopeId: string;
let acme: string;

const now = () => toDbDate(new Date(), t.dialect);

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
      role: "user",
      disabled_at: null,
    })
    .execute();
  return id;
};

const insertWorkspace = async (name: string) => {
  const id = newId();
  await t.db
    .insertInto("workspaces")
    .values({
      id,
      name,
      description: `${name}.`,
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

const insert = (fields: Partial<Record<string, unknown>> = {}) =>
  t.db
    .insertInto("scope_moves")
    .values({
      id: newId(),
      scope_id: scopeId,
      from_workspace_id: GLOBAL_WORKSPACE_ID,
      to_workspace_id: acme,
      requested_by: userId,
      new_name: "infra",
      message: "Acme runs it now.",
      status: "open",
      decided_by: null,
      reason: null,
      created_at: now(),
      decided_at: null,
      ...fields,
    } as never)
    .execute();

const rows = () => t.db.selectFrom("scope_moves").selectAll().execute();

beforeEach(async () => {
  t = await createTestDb();
  userId = await insertUser("u@example.com");
  acme = await insertWorkspace("acme");
  scopeId = await kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name: "infra",
    description: "Infrastructure.",
    workspaceId: GLOBAL_WORKSPACE_ID,
    createdBy: null,
    createdAt: new Date(),
  });
});
afterEach(() => t.cleanup());

describe("0024_scope_moves", () => {
  it("has the keys: cascade from the scope, the target and the asker; set null from the source and the answerer", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["scope_moves"]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "scope_moves", references: "scopes", onDelete: "CASCADE" },
        { table: "scope_moves", references: "workspaces", onDelete: "SET NULL" },
        { table: "scope_moves", references: "workspaces", onDelete: "CASCADE" },
        { table: "scope_moves", references: "user", onDelete: "CASCADE" },
        { table: "scope_moves", references: "user", onDelete: "SET NULL" },
      ]),
    );
    expect(keys).toHaveLength(5);
  });

  it("enforces them: a real scope, workspaces and asker", async () => {
    await expect(insert({ scope_id: newId() })).rejects.toThrow();
    await expect(insert({ to_workspace_id: newId() })).rejects.toThrow();
    await expect(insert({ from_workspace_id: newId() })).rejects.toThrow();
    await expect(insert({ requested_by: newId() })).rejects.toThrow();
    await expect(insert({ decided_by: newId() })).rejects.toThrow();
    await insert();
    expect(await rows()).toHaveLength(1);
  });

  it("goes with its scope, and with its target workspace", async () => {
    await insert();
    await t.db.deleteFrom("scopes").where("id", "=", scopeId).execute();
    expect(await rows()).toEqual([]);
    scopeId = await kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
      name: "infra",
      description: "Again.",
      workspaceId: GLOBAL_WORKSPACE_ID,
      createdBy: null,
      createdAt: new Date(),
    });
    await insert();
    await t.db.deleteFrom("workspaces").where("id", "=", acme).execute();
    expect(await rows()).toEqual([]);
  });

  it("keeps a move once its source is deleted, and once whoever answered is gone", async () => {
    // The scope moved out of beta, now empty and deleted; the answerer's account removed.
    const beta = await insertWorkspace("beta");
    const answerer = await insertUser("a@example.com");
    await insert({ from_workspace_id: beta, status: "approved", decided_by: answerer });
    await t.db.deleteFrom("workspaces").where("id", "=", beta).execute();
    await t.db.deleteFrom("user").where("id", "=", answerer).execute();
    expect(await rows()).toEqual([
      expect.objectContaining({ from_workspace_id: null, decided_by: null, status: "approved" }),
    ]);
  });

  it("keeps a message and a reason of 500 characters in any script, and a 64-character name", async () => {
    const message = "ç日".repeat(250);
    const name = "n".repeat(64);
    await insert({ message, reason: message, new_name: name });
    expect((await rows())[0]).toMatchObject({ message, reason: message, new_name: name });
  });

  it("gives versions a reviewed_by that's empty, a real user, and set null with them", async () => {
    const items = kyselyItemRepository(t.db, t.dialect, UNFILTERED);
    const itemId = await items.insertItem({
      scopeId,
      name: "deploy",
      type: "skill",
      description: "Deploys.",
      ownerId: null,
      createdAt: new Date(),
    });
    const versionId = await items.insertVersion({
      itemId,
      version: "1.0.0",
      manifest: { name: "@infra/deploy", type: "skill", description: "Deploys.", version: "1.0.0" },
      readme: null,
      files: [],
      notes: null,
      artifactPath: "infra/deploy/1.0.0.tgz",
      sha256: "0".repeat(64),
      size: 1,
      publishedBy: userId,
      publishedAt: new Date(),
      submissionId: null,
      dependencies: [],
      riskFlags: [],
    });
    const reviewedBy = async () =>
      (
        await t.db
          .selectFrom("item_versions")
          .select("reviewed_by")
          .where("id", "=", versionId)
          .executeTakeFirstOrThrow()
      ).reviewed_by;
    expect(await reviewedBy()).toBeNull();
    const set = (id: string) =>
      t.db
        .updateTable("item_versions")
        .set({ reviewed_by: id })
        .where("id", "=", versionId)
        .execute();
    await expect(set(newId())).rejects.toThrow();
    const reviewer = await insertUser("r@example.com");
    await set(reviewer);
    expect(await reviewedBy()).toBe(reviewer);
    expect(await foreignKeys(t.db, t.dialect, ["item_versions"])).toContainEqual({
      table: "item_versions",
      references: "user",
      onDelete: "SET NULL",
    });
    await t.db.deleteFrom("user").where("id", "=", reviewer).execute();
    expect(await reviewedBy()).toBeNull();
  });

  it("is safe to run again", async () => {
    await insert();
    await scopeMoves(t.dialect).up(t.db as never);
    expect(await rows()).toHaveLength(1);
    expect(
      (await foreignKeys(t.db, t.dialect, ["item_versions"])).filter(
        (k) => k.references === "user" && k.onDelete === "SET NULL",
      ),
    ).toHaveLength(1);
  });
});
