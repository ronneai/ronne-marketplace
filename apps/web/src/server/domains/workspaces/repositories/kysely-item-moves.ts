import type { Kysely, Selectable } from "kysely";
import { bumpCatalogueRevision } from "../../../db/catalogue-revision";
import { fromDbDate, toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { forUpdate } from "../../../db/locks";
import type { Database, ItemMoveTable } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import type { ItemMove } from "../models/item-move";
import type { WorkspaceRepository } from "./workspace-repository";

type ItemMoveMethods = Pick<
  WorkspaceRepository,
  | "itemForMove"
  | "itemNamedIn"
  | "newItemSubmittedIn"
  | "submissionsAbout"
  | "lockItemForMove"
  | "openItemMoveOf"
  | "findItemMove"
  | "lockItemMove"
  | "insertItemMove"
  | "decideItemMove"
  | "applyItemMove"
  | "roleIn"
>;

type MoveRow = Selectable<ItemMoveTable>;

const toMove = (row: MoveRow): ItemMove => ({
  id: row.id,
  itemId: row.item_id,
  fromScopeId: row.from_scope_id,
  toScopeId: row.to_scope_id,
  requestedBy: row.requested_by,
  message: row.message,
  status: row.status,
  decidedBy: row.decided_by,
  reason: row.reason,
  createdAt: fromDbDate(row.created_at) as Date,
  decidedAt: fromDbDate(row.decided_at),
});

/** How many ids go in one `in (…)` list. */
const IN_LIST_SIZE = 500;

/** Moving an item to another scope of its workspace (134): what the checks read. */
export const itemMoveMethods = (
  db: Kysely<Database>,
  dialect: DatabaseDialect,
): ItemMoveMethods => ({
  itemForMove: async (itemId) => {
    const row = await db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .select([
        "items.id as id",
        "items.name as name",
        "items.type as type",
        "scopes.id as scope_id",
        "scopes.name as scope_name",
        "scopes.workspace_id as workspace_id",
      ])
      .where("items.id", "=", itemId)
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          name: row.name,
          type: row.type,
          scopeId: row.scope_id,
          scopeName: row.scope_name,
          workspaceId: row.workspace_id,
        }
      : null;
  },

  itemNamedIn: async (scopeId, name) => {
    const rows = await db
      .selectFrom("items")
      .select("name")
      .where("scope_id", "=", scopeId)
      .where("name", "=", name)
      .execute();
    // Byte for byte: MySQL's collation would match a name in another case.
    return rows.some((row) => row.name === name);
  },

  newItemSubmittedIn: async (scopeId, name) => {
    const rows = await db
      .selectFrom("submissions")
      .select("name")
      .where("scope_id", "=", scopeId)
      .where("name", "=", name)
      .where("item_id", "is", null)
      .where("status", "in", ["submitted", "changes_requested", "approved"])
      .execute();
    return rows.some((row) => row.name === name);
  },

  submissionsAbout: async (ids) => {
    const found = new Map<string, { authorId: string; status: string; itemId: string | null }>();
    for (let i = 0; i < ids.length; i += IN_LIST_SIZE) {
      const rows = await db
        .selectFrom("submissions")
        .select(["id", "author_id", "status", "item_id"])
        .where("id", "in", ids.slice(i, i + IN_LIST_SIZE))
        .execute();
      for (const row of rows)
        found.set(row.id, { authorId: row.author_id, status: row.status, itemId: row.item_id });
    }
    return found;
  },

  lockItemForMove: async (itemId) => {
    await forUpdate(
      db.selectFrom("items").select("id").where("id", "=", itemId),
      dialect,
    ).execute();
  },

  openItemMoveOf: async (itemId) => {
    const row = await db
      .selectFrom("item_moves")
      .selectAll()
      .where("item_id", "=", itemId)
      .where("status", "=", "open")
      .executeTakeFirst();
    return row ? toMove(row) : null;
  },

  findItemMove: async (id) => {
    const row = await db
      .selectFrom("item_moves")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? toMove(row) : null;
  },

  lockItemMove: async (id) => {
    await forUpdate(
      db.selectFrom("item_moves").select("id").where("id", "=", id),
      dialect,
    ).execute();
  },

  insertItemMove: async (move) => {
    const id = newId();
    const at = toDbDate(move.at, dialect);
    await db
      .insertInto("item_moves")
      .values({
        id,
        item_id: move.itemId,
        from_scope_id: move.fromScopeId,
        to_scope_id: move.toScopeId,
        requested_by: move.requestedBy,
        message: move.message,
        status: move.status,
        decided_by: move.decidedBy,
        reason: null,
        created_at: at,
        decided_at: move.status === "open" ? null : at,
      })
      .execute();
    return id;
  },

  decideItemMove: async (id, decision) => {
    const result = await db
      .updateTable("item_moves")
      .set({
        status: decision.status,
        decided_by: decision.decidedBy,
        reason: decision.reason,
        decided_at: toDbDate(decision.at, dialect),
      })
      .where("id", "=", id)
      .where("status", "=", "open")
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  },

  applyItemMove: async (itemId, scopeId) => {
    await db.updateTable("items").set({ scope_id: scopeId }).where("id", "=", itemId).execute();
    // Its drafts, proposals and the submissions that released it: one item, one scope.
    await db
      .updateTable("submissions")
      .set({ scope_id: scopeId })
      .where("item_id", "=", itemId)
      .execute();
    await bumpCatalogueRevision(db);
  },

  roleIn: async (userId, workspaceId) => {
    const user = await db
      .selectFrom("user")
      .select(["role", "disabled_at"])
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user || user.disabled_at !== null) return null;
    const member = await db
      .selectFrom("workspace_members")
      .select("role")
      .where("workspace_id", "=", workspaceId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return { root: user.role === "root", role: member?.role ?? null };
  },
});
