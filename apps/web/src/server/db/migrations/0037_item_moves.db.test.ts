import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { kyselyItemRepository } from "../../domains/items/repositories/kysely-item-repository";
import { kyselyScopeRepository } from "../../domains/items/repositories/kysely-scope-repository";
import { UNFILTERED } from "../../domains/workspaces/models/viewer";
import { fromDbDate, toDbDate } from "../dates";
import { newId } from "../ids";
import { foreignKeys } from "../testing/foreign-keys";
import { createTestDb, type TestDb } from "../testing/test-db";
import { GLOBAL_WORKSPACE_ID } from "./0019_workspaces";
import { historyBatches, itemMoves } from "./0037_item_moves";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let userId: string;
let infra: string;
let devops: string;
let itemId: string;

const at = (iso: string) => toDbDate(new Date(iso), t.dialect);

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
      created_at: at("2026-10-01T00:00:00Z"),
      updated_at: at("2026-10-01T00:00:00Z"),
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
      created_at: at("2026-10-01T00:00:00Z"),
      updated_at: at("2026-10-01T00:00:00Z"),
    } as never)
    .execute();
  return id;
};

const insertScope = (name: string, workspaceId = GLOBAL_WORKSPACE_ID) =>
  kyselyScopeRepository(t.db, t.dialect, UNFILTERED).insert({
    name,
    description: `${name}.`,
    workspaceId,
    createdBy: null,
    createdAt: new Date(),
  });

const insertItem = (scopeId: string, name: string) =>
  kyselyItemRepository(t.db, t.dialect, UNFILTERED).insertItem({
    scopeId,
    name,
    type: "skill",
    description: "Does it.",
    ownerId: null,
    createdAt: new Date(),
  });

const insertMove = (fields: Partial<Record<string, unknown>> = {}) =>
  t.db
    .insertInto("item_moves")
    .values({
      id: newId(),
      item_id: itemId,
      from_scope_id: infra,
      to_scope_id: devops,
      requested_by: userId,
      message: "It belongs with devops.",
      status: "open",
      decided_by: null,
      reason: null,
      created_at: at("2026-10-27T00:00:00Z"),
      decided_at: null,
      ...fields,
    } as never)
    .execute();

const insertHistory = (fields: Partial<Record<string, unknown>> = {}) =>
  t.db
    .insertInto("item_name_history")
    .values({
      id: newId(),
      item_id: itemId,
      old_name: "@infra/deploy",
      new_name: "@devops/deploy",
      reason: "move_item",
      requested_by: userId,
      decided_by: null,
      source_id: null,
      created_at: at("2026-10-27T00:00:00Z"),
      ...fields,
    } as never)
    .execute();

const alias = (name: string, reason: string, when: string, item = itemId) =>
  t.db
    .insertInto("item_aliases")
    .values({ name, item_id: item, reason, created_at: at(when) })
    .execute();

const moves = () => t.db.selectFrom("item_moves").selectAll().execute();

/** The history the backfill wrote, oldest first, without ids. */
const history = async (item = itemId) =>
  (await t.db.selectFrom("item_name_history").selectAll().where("item_id", "=", item).execute())
    .map((row) => ({ ...row, created_at: (fromDbDate(row.created_at) as Date).toISOString() }))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(({ id: _id, item_id: _item, ...row }) => row);

const runBackfill = () => itemMoves(t.dialect).up(t.db as never);

beforeEach(async () => {
  t = await createTestDb();
  userId = await insertUser("u@example.com");
  infra = await insertScope("infra");
  devops = await insertScope("devops");
  itemId = await insertItem(infra, "deploy");
});
afterEach(() => t.cleanup());

describe("0037_item_moves: item_moves", () => {
  it("has the keys: cascade from the item, the target and the asker; set null from the source and the answerer", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["item_moves"]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "item_moves", references: "items", onDelete: "CASCADE" },
        { table: "item_moves", references: "scopes", onDelete: "SET NULL" },
        { table: "item_moves", references: "scopes", onDelete: "CASCADE" },
        { table: "item_moves", references: "user", onDelete: "CASCADE" },
        { table: "item_moves", references: "user", onDelete: "SET NULL" },
      ]),
    );
    expect(keys).toHaveLength(5);
  });

  it("enforces them: a real item, scopes, asker and answerer", async () => {
    await expect(insertMove({ item_id: newId() })).rejects.toThrow();
    await expect(insertMove({ from_scope_id: newId() })).rejects.toThrow();
    await expect(insertMove({ to_scope_id: newId() })).rejects.toThrow();
    await expect(insertMove({ requested_by: newId() })).rejects.toThrow();
    await expect(insertMove({ decided_by: newId() })).rejects.toThrow();
    await insertMove();
    expect(await moves()).toHaveLength(1);
  });

  it("goes with its item, and with its target scope", async () => {
    await insertMove();
    await t.db.deleteFrom("items").where("id", "=", itemId).execute();
    expect(await moves()).toEqual([]);
    itemId = await insertItem(infra, "deploy");
    await insertMove();
    await t.db.deleteFrom("scopes").where("id", "=", devops).execute();
    expect(await moves()).toEqual([]);
  });

  it("keeps a move once its source scope is deleted, and once whoever answered is gone", async () => {
    const answerer = await insertUser("a@example.com");
    await insertMove({
      status: "approved",
      decided_by: answerer,
      decided_at: at("2026-10-27T01:00:00Z"),
    });
    // The item now lives in devops, so infra can go.
    await t.db.updateTable("items").set({ scope_id: devops }).where("id", "=", itemId).execute();
    await t.db.deleteFrom("scopes").where("id", "=", infra).execute();
    await t.db.deleteFrom("user").where("id", "=", answerer).execute();
    expect(await moves()).toEqual([
      expect.objectContaining({ from_scope_id: null, decided_by: null, status: "approved" }),
    ]);
  });

  it("keeps a message and a reason of 500 characters in any script", async () => {
    const message = "ç日".repeat(250);
    await insertMove({ message, reason: message });
    expect((await moves())[0]).toMatchObject({ message, reason: message });
  });
});

describe("0037_item_moves: item_name_history", () => {
  it("has the keys: cascade from the item; set null from both people", async () => {
    const keys = await foreignKeys(t.db, t.dialect, ["item_name_history"]);
    expect(keys).toEqual(
      expect.arrayContaining([
        { table: "item_name_history", references: "items", onDelete: "CASCADE" },
        { table: "item_name_history", references: "user", onDelete: "SET NULL" },
      ]),
    );
    expect(keys).toHaveLength(3);
  });

  it("goes with its item, and keeps the entry when the people are gone", async () => {
    const answerer = await insertUser("a@example.com");
    await insertHistory({ decided_by: answerer });
    await t.db.deleteFrom("user").where("id", "=", userId).execute();
    await t.db.deleteFrom("user").where("id", "=", answerer).execute();
    expect(await history()).toEqual([
      expect.objectContaining({ requested_by: null, decided_by: null }),
    ]);
    await t.db.deleteFrom("items").where("id", "=", itemId).execute();
    expect(await t.db.selectFrom("item_name_history").selectAll().execute()).toEqual([]);
  });

  it("keeps the longest full names byte for byte", async () => {
    const long = `@${"w".repeat(64)}/${"s".repeat(64)}/${"n".repeat(64)}`;
    await insertHistory({ old_name: long, new_name: `${long.slice(0, -1)}m` });
    expect((await history())[0]).toMatchObject({
      old_name: long,
      new_name: `${long.slice(0, -1)}m`,
    });
  });
});

describe("0037_item_moves: the backfill", () => {
  it("chains each alias to the next one, then to the current name, with its reason and date", async () => {
    // @infra/deploy in global, then 118 (acme), a rename (acme → beta), a scope move to global.
    const other = await insertItem(devops, "lint");
    await alias("@infra/deploy-old", "migration", "2026-10-10T00:00:00Z");
    await alias("@acme/infra/deploy", "rename", "2026-10-12T00:00:00Z");
    await alias("@beta/infra/deploy", "move", "2026-10-14T00:00:00Z");
    await alias("@devops/lint-old", "migration", "2026-10-10T00:00:00Z", other);
    await runBackfill();
    expect(await history()).toEqual([
      expect.objectContaining({
        old_name: "@infra/deploy-old",
        new_name: "@acme/infra/deploy",
        reason: "migration",
        created_at: "2026-10-10T00:00:00.000Z",
      }),
      expect.objectContaining({
        old_name: "@acme/infra/deploy",
        new_name: "@beta/infra/deploy",
        reason: "rename_workspace",
      }),
      expect.objectContaining({
        old_name: "@beta/infra/deploy",
        new_name: "@infra/deploy",
        reason: "move_scope",
        requested_by: null,
        decided_by: null,
        source_id: null,
      }),
    ]);
    expect(await history(other)).toEqual([
      expect.objectContaining({ old_name: "@devops/lint-old", new_name: "@devops/lint" }),
    ]);
  });

  it("names the current workspace outside global", async () => {
    const acme = await insertWorkspace("acme");
    await t.db.updateTable("scopes").set({ workspace_id: acme }).where("id", "=", infra).execute();
    await alias("@infra/deploy", "migration", "2026-10-10T00:00:00Z");
    await runBackfill();
    expect(await history()).toEqual([
      expect.objectContaining({ old_name: "@infra/deploy", new_name: "@acme/infra/deploy" }),
    ]);
  });

  it("finds who asked and answered a scope move decided at the same instant, and nobody otherwise", async () => {
    const acme = await insertWorkspace("acme");
    const answerer = await insertUser("a@example.com");
    const moveId = newId();
    const scopeMove = (id: string, decidedAt: string, scope = infra) =>
      t.db
        .insertInto("scope_moves")
        .values({
          id,
          scope_id: scope,
          from_workspace_id: acme,
          to_workspace_id: GLOBAL_WORKSPACE_ID,
          requested_by: userId,
          new_name: "infra",
          message: null,
          status: "approved",
          decided_by: answerer,
          reason: null,
          created_at: at("2026-10-13T00:00:00Z"),
          decided_at: at(decidedAt),
        } as never)
        .execute();
    // Both scopes moved at the same instant, each item finds its own scope's move, whatever order
    // the rows come back in; this scope's move at another instant matches nothing.
    const devopsMoveId = newId();
    await scopeMove(devopsMoveId, "2026-10-14T00:00:00Z", devops);
    await scopeMove(moveId, "2026-10-14T00:00:00Z");
    await scopeMove(newId(), "2026-10-15T00:00:00Z");
    const lint = await insertItem(devops, "lint");
    await alias("@acme/devops/lint", "move", "2026-10-14T00:00:00Z", lint);
    await alias("@acme/infra/deploy", "move", "2026-10-14T00:00:00Z");
    await alias("@acme/infra/deploy-2", "move", "2026-10-16T00:00:00Z");
    await runBackfill();
    expect(await history()).toEqual([
      expect.objectContaining({
        reason: "move_scope",
        requested_by: userId,
        decided_by: answerer,
        source_id: moveId,
      }),
      expect.objectContaining({ requested_by: null, decided_by: null, source_id: null }),
    ]);
    expect(await history(lint)).toEqual([expect.objectContaining({ source_id: devopsMoveId })]);
  });

  it("writes batches that never split one item's entries", () => {
    const groups = [["a1"], ["b1", "b2", "b3"], ["c1", "c2"], [], ["d1", "d2", "d3", "d4", "d5"]];
    expect(historyBatches(groups, 4)).toEqual([
      ["a1", "b1", "b2", "b3"],
      ["c1", "c2"],
      ["d1", "d2", "d3", "d4", "d5"],
    ]);
    expect(historyBatches([], 4)).toEqual([]);
  });

  it("adds nothing twice when it runs again, and nothing for items without aliases", async () => {
    await alias("@acme/infra/deploy", "move", "2026-10-14T00:00:00Z");
    await runBackfill();
    await runBackfill();
    expect(await history()).toHaveLength(1);
    const fresh = await insertItem(devops, "fresh");
    expect(await history(fresh)).toEqual([]);
  });

  it("keeps only what the aliases still say after a scope moved back", async () => {
    // acme → global → acme: the acme name became the name again, so only the last change is left.
    const acme = await insertWorkspace("acme");
    await t.db.updateTable("scopes").set({ workspace_id: acme }).where("id", "=", infra).execute();
    await alias("@infra/deploy", "move", "2026-10-15T00:00:00Z");
    await runBackfill();
    expect(await history()).toEqual([
      expect.objectContaining({ old_name: "@infra/deploy", new_name: "@acme/infra/deploy" }),
    ]);
  });
});
