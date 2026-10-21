import { formatItemName } from "@ronneai/core";
import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { Viewer } from "../../workspaces/models/viewer";
import {
  inListedWorkspace,
  inVisibleWorkspace,
  isVisibleItem,
} from "../../workspaces/repositories/visible";
import { canonicalId } from "../models/shelf";
import type { ShelfItemFacts, ShelfItemsRepository } from "./shelf-items-repository";

export const kyselyShelfItemsRepository = (
  db: Kysely<Database>,
  viewer: Viewer,
): ShelfItemsRepository => {
  const facts: ShelfItemsRepository["facts"] = async (itemIds) => {
    const answer = new Map<string, ShelfItemFacts>();
    if (itemIds.length === 0) return answer;
    const rows = await db
      .selectFrom("items")
      .innerJoin("scopes", "scopes.id", "items.scope_id")
      .innerJoin("workspaces", "workspaces.id", "scopes.workspace_id")
      .select([
        "items.id",
        "items.name",
        "items.listed_version_id",
        "items.installable",
        "scopes.name as scope",
        "workspaces.id as workspace_id",
        "workspaces.name as workspace",
        "workspaces.visibility",
      ])
      .where("items.id", "in", itemIds.map(canonicalId))
      .where(isVisibleItem(viewer, "items.id"))
      .execute();
    for (const row of rows)
      answer.set(row.id, {
        availability:
          row.listed_version_id !== null && Number(row.installable) === 1
            ? "available"
            : "unavailable",
        name: formatItemName({ workspace: row.workspace, scope: row.scope, name: row.name }),
        workspaceId: row.workspace_id,
        // Exactly "public": a stored value can only be one of the two.
        workspaceVisibility: row.visibility === "public" ? "public" : "private",
      });
    return answer;
  };

  return {
    facts,
    availability: async (itemIds) =>
      new Map([...(await facts(itemIds))].map(([id, f]) => [id, f.availability])),
    workspaces: async (which, limit) => {
      if (which !== "all" && which.length === 0) return [];
      let query = db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where(inVisibleWorkspace(viewer, "workspaces.id"))
        .where(inListedWorkspace(viewer, "workspaces.id"));
      if (which !== "all") query = query.where("id", "in", which.map(canonicalId));
      return query.orderBy("name", "asc").limit(limit).execute();
    },
    workspace: async (id) =>
      (await db
        .selectFrom("workspaces")
        .select(["id", "name"])
        .where("id", "=", canonicalId(id))
        .where(inVisibleWorkspace(viewer, "workspaces.id"))
        .executeTakeFirst()) ?? null,
  };
};
