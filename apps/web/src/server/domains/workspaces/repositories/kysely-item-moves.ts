import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { WorkspaceRepository } from "./workspace-repository";

type ItemMoveMethods = Pick<
  WorkspaceRepository,
  "itemForMove" | "itemNamedIn" | "newItemSubmittedIn" | "submissionsAbout"
>;

/** How many ids go in one `in (…)` list. */
const IN_LIST_SIZE = 500;

/** Moving an item to another scope of its workspace (134): what the checks read. */
export const itemMoveMethods = (db: Kysely<Database>): ItemMoveMethods => ({
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
});
