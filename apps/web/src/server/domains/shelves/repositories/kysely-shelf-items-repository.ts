import type { Kysely } from "kysely";
import type { Database } from "../../../db/schema";
import type { Viewer } from "../../workspaces/models/viewer";
import { isVisibleItem } from "../../workspaces/repositories/visible";
import type { ItemAvailability, ShelfItemsRepository } from "./shelf-items-repository";

export const kyselyShelfItemsRepository = (
  db: Kysely<Database>,
  viewer: Viewer,
): ShelfItemsRepository => ({
  availability: async (itemIds) => {
    const answer = new Map<string, ItemAvailability>();
    if (itemIds.length === 0) return answer;
    const rows = await db
      .selectFrom("items")
      .select(["id", "listed_version_id", "installable"])
      .where("id", "in", [...itemIds])
      .where(isVisibleItem(viewer, "items.id"))
      .execute();
    for (const row of rows)
      answer.set(
        row.id,
        row.listed_version_id !== null && Number(row.installable) === 1
          ? "available"
          : "unavailable",
      );
    return answer;
  },
});
